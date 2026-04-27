#!/usr/bin/libexec/platform-python
"""
OCP Installer UI - Backend Server
Python 3.6 표준 라이브러리만 사용
"""

import sys, os, json, re, uuid, time, threading, subprocess, argparse
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# ── 경로 설정 ────────────────────────────────────────────────────────

_default_install = Path(__file__).resolve().parents[2] / "install"
INSTALL_DIR    = Path(os.environ.get("INSTALL_DIR", str(_default_install)))
VARS_DIR       = INSTALL_DIR / "00-vars"
INVENTORY_DIR  = INSTALL_DIR / "00-inventory"
INVENTORY_FILE = INVENTORY_DIR / "hosts.txt"
RUN_SH         = INSTALL_DIR / "run.sh"
HISTORY_FILE   = Path(__file__).parent / "job_history.json"

ENV_FILES = {
    "cluster":        VARS_DIR / "cluster.env",
    "network":        VARS_DIR / "network.env",
    "registry":       VARS_DIR / "registry.env",
    "bastion":        VARS_DIR / "bastion.env",
    "install_config": VARS_DIR / "install-config.env",
    "post":           VARS_DIR / "post.env",
}

PRE_STEPS = [
    ("00-command-extract",   "01-pre/00-command-extract.sh"),
    ("01-disable-selinux",   "01-pre/01-disable-selinux.sh"),
    ("02-bastion-account",   "01-pre/02-bastion-account.sh"),
    ("03-bastion-chrony",    "01-pre/03-bastion-chrony.sh"),
    ("04-make-certs",        "01-pre/04-make-certs.sh"),
    ("05-registry",          "01-pre/05-registry.sh"),
    ("06-hosts-render",      "01-pre/06-hosts-render.sh"),
    ("07-dns-render",        "01-pre/07-dns-render.sh"),
    ("08-haproxy-render",    "01-pre/08-haproxy-render.sh"),
    ("09-tftp-install",      "01-pre/09-tftp-install.sh"),
    ("10-dhcp-render",       "01-pre/10-dhcp-render.sh"),
    ("11-pxe-grub-render",   "01-pre/11-pxe-grub-render.sh"),
    ("12-keepalived-render", "01-pre/12-keepalived-render.sh"),
    ("13-httpd",             "01-pre/13-httpd.sh"),
]
INSTALL_STEPS = [
    ("00-install-config-render", "02-install/00-install-config-render.sh"),
    ("01-manifests-generate",    "02-install/01-manifests-generate.sh"),
    ("01a-mc-init-render",       "02-install/01a-mc-init-render.sh"),
    ("02-ignition-generate",     "02-install/02-ignition-generate.sh"),
    ("03-publish-artifacts",     "02-install/03-publish-artifacts.sh"),
    ("05-bootstrap-cmd",         "02-install/05-bootstrap-62011-cmd.sh"),
    ("06-kubeconfig",            "02-install/06-kubeconfig.sh"),
]
POST_STEPS = [
    ("00-admin-user",        "03-post/00-openshift-admin-user.sh"),
    ("01-ingress-master",    "03-post/01-ingress-master.sh"),
    ("02-whereabouts",       "03-post/02-whereabouts-reconciler.sh"),
    ("03-user-workload-mon", "03-post/03-userWorkloadMonitoring.sh"),
    ("04-routing-via-host",  "03-post/04-routingViaHost.sh"),
    ("05-catalog-sources",   "03-post/05-enableCatalogSources.sh"),
]
ALL_STEPS = {n: str(INSTALL_DIR / p) for n, p in PRE_STEPS + INSTALL_STEPS + POST_STEPS}
STEPS_META = {
    "pre":     [{"id": n, "label": n, "script": p} for n, p in PRE_STEPS],
    "install": [{"id": n, "label": n, "script": p} for n, p in INSTALL_STEPS],
    "post":    [{"id": n, "label": n, "script": p} for n, p in POST_STEPS],
}

# ── Job 저장소 ───────────────────────────────────────────────────────

_jobs = {}
_jobs_lock = threading.Lock()


def _load_history():
    if HISTORY_FILE.exists():
        try:
            saved = json.loads(HISTORY_FILE.read_text())
            for job in saved:
                _jobs[job["id"]] = job
        except Exception:
            pass


def _save_history():
    try:
        with _jobs_lock:
            jobs = list(_jobs.values())
        # 최근 50개만 유지
        jobs = sorted(jobs, key=lambda j: j.get("started_at", 0), reverse=True)[:50]
        HISTORY_FILE.write_text(json.dumps(jobs, ensure_ascii=False))
    except Exception:
        pass


def new_job(mode, script):
    jid = str(uuid.uuid4())[:8]
    with _jobs_lock:
        _jobs[jid] = {
            "id": jid, "mode": mode, "script": script,
            "status": "running", "started_at": time.time(),
            "finished_at": None, "returncode": None, "logs": [],
        }
    return jid


def append_log(jid, line):
    with _jobs_lock:
        _jobs[jid]["logs"].append(line)


def finish_job(jid, returncode):
    with _jobs_lock:
        _jobs[jid]["returncode"]  = returncode
        _jobs[jid]["status"]      = "success" if returncode == 0 else "failed"
        _jobs[jid]["finished_at"] = time.time()
    _save_history()


def run_script_thread(jid, cmd):
    try:
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            cwd=str(INSTALL_DIR)
        )
        for raw in proc.stdout:
            append_log(jid, raw.decode("utf-8", errors="replace").rstrip())
        proc.wait()
        finish_job(jid, proc.returncode)
    except Exception as e:
        append_log(jid, "[INTERNAL ERROR] {}".format(e))
        finish_job(jid, 1)


# ── env 파서 ─────────────────────────────────────────────────────────

def _parse_env_line(line):
    """
    다양한 env 포맷 파싱:
      KEY="value"
      KEY="${KEY:-default}"
      KEY="${KEY:-${OTHER}/path/$(cmd)}"  # 중첩 변수/명령 치환
      KEY=bare_value
      KEY='single_quoted'
    """
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    eq = line.find("=")
    if eq < 0:
        return None
    key = line[:eq].strip()
    if not re.match(r"^[A-Z_][A-Z0-9_]*$", key):
        return None
    rest = line[eq+1:]

    if rest.startswith('"'):
        inner = rest[1:]
        close = inner.rfind('"')
        if close >= 0:
            inner = inner[:close]
        # ${KEY:-default} 패턴 — default에 중첩 변수 포함 가능
        m = re.match(r"^\$\{" + re.escape(key) + r":-(?P<default>.*)\}$", inner)
        if m:
            return key, m.group("default")
        return key, inner

    if rest.startswith("'"):
        inner = rest[1:]
        close = inner.rfind("'")
        if close >= 0:
            inner = inner[:close]
        return key, inner

    # bare value
    val = re.split(r"[\s#]", rest)[0]
    return key, val


def parse_env(path):
    result = {}
    if not Path(path).exists():
        return result
    with open(path) as f:
        for line in f:
            r = _parse_env_line(line)
            if r:
                result[r[0]] = r[1]
    return result


def write_env(path, data, original_path=None):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    # 기존 파일 백업 (.bak)
    if Path(path).exists():
        bak = str(path) + ".bak"
        try:
            import shutil
            shutil.copy2(path, bak)
        except Exception:
            pass
    src = original_path if (original_path and Path(original_path).exists()) else None
    if src:
        with open(src) as f:
            lines = f.read().splitlines()
        out = []
        for line in lines:
            r = _parse_env_line(line)
            if r and r[0] in data:
                k = r[0]
                out.append('{k}="${{{k}:-{v}}}"'.format(k=k, v=data[k]))
            else:
                out.append(line)
    else:
        out = ['{k}="${{{k}:-{v}}}"'.format(k=k, v=v) for k, v in data.items()]
    with open(path, "w") as f:
        f.write("\n".join(out) + "\n")


# ── inventory 파서 ───────────────────────────────────────────────────

def parse_inventory(path):
    entries = []
    if not Path(path).exists():
        return entries
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            cols = line.split()
            if len(cols) < 3:
                continue
            entries.append({
                "fqdn":        cols[0],
                "role":        cols[1] if len(cols) > 1 else "",
                "ip":          cols[2] if len(cols) > 2 else "",
                "gateway":     cols[3] if len(cols) > 3 else "",
                "nic":         cols[4] if len(cols) > 4 else "",
                "mac":         cols[5] if len(cols) > 5 else "",
                "nettype":     cols[6] if len(cols) > 6 else "ethernet",
                "vlan_id":     cols[7] if len(cols) > 7 else "-",
                "install_dev": cols[8] if len(cols) > 8 else "",
            })
    return entries


def write_inventory(path, hosts):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    lines = ["# hostname role ip gateway nic mac nettype vlan_id install_dev"]
    for h in hosts:
        parts = [h.get(k, "") for k in
                 ("fqdn","role","ip","gateway","nic","mac","nettype","vlan_id","install_dev")]
        lines.append("\t".join(parts))
    with open(path, "w") as f:
        f.write("\n".join(lines) + "\n")


# ── 서비스 상태 ──────────────────────────────────────────────────────

def service_status(name):
    try:
        r = subprocess.run(["systemctl", "is-active", name],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3)
        return r.stdout.decode().strip()
    except Exception:
        return "unknown"


def container_status(name):
    for rt in ("podman", "docker"):
        try:
            r = subprocess.run(
                [rt, "inspect", "--format", "{{.State.Status}}", name],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3)
            if r.returncode == 0:
                return r.stdout.decode().strip()
        except FileNotFoundError:
            continue
    return "unknown"


def registry_containers_status():
    """REGISTRIES_CSV에서 레지스트리 이름 목록 파싱 후 상태 반환."""
    reg_env = parse_env(ENV_FILES["registry"])
    csv = reg_env.get("REGISTRIES_CSV", "infra_registry|/NFS/infra_registry|5000")
    result = {}
    for entry in csv.split(","):
        entry = entry.strip()
        if not entry:
            continue
        parts = entry.split("|")
        name = parts[0].strip() if parts else entry
        result[name] = container_status(name)
    return result


# ── Preflight Check ──────────────────────────────────────────────────

def preflight_pre():
    checks = []

    # tar 파일 존재
    pre_dir = INSTALL_DIR / "01-pre"
    tars = [f for f in pre_dir.iterdir()
            if f.suffix in ('.gz', '.tar') or f.name.endswith('.tar.gz')] \
           if pre_dir.exists() else []
    checks.append({
        "name": "바이너리 tar 파일",
        "ok": len(tars) > 0,
        "detail": "{} 개 발견".format(len(tars)) if tars else "01-pre/ 에 tar/tar.gz 파일 없음",
    })

    # COS 파일
    cos_dir = INSTALL_DIR / "cos"
    cos_ok = True
    cos_detail = []
    if not cos_dir.exists():
        cos_ok = False
        cos_detail.append("cos/ 디렉토리 없음")
    else:
        names = [f.name for f in cos_dir.iterdir()]
        for key in ("kernel", "initramfs", "rootfs"):
            matched = [n for n in names if key in n]
            if len(matched) != 1:
                cos_ok = False
                cos_detail.append("{}: {}".format(key, "없음" if not matched else "중복"))
    checks.append({
        "name": "COS 파일 (kernel/initramfs/rootfs)",
        "ok": cos_ok,
        "detail": "정상" if cos_ok else ", ".join(cos_detail),
    })

    # hosts.txt 유효성
    hosts = parse_inventory(INVENTORY_FILE)
    roles = [h["role"] for h in hosts]
    missing = [r for r in ("bastion", "bootstrap", "master") if r not in roles]
    checks.append({
        "name": "인벤토리 필수 역할",
        "ok": len(missing) == 0,
        "detail": "bastion/bootstrap/master 모두 있음" if not missing
                  else "없음: {}".format(", ".join(missing)),
    })

    # ISO 마운트 및 grubx64.efi 체크
    # /media 또는 /mnt 중 하나에 ISO가 마운트되어 있는지 확인
    grub_candidates = [
        Path("/media/EFI/BOOT/grubx64.efi"),
        Path("/mnt/EFI/BOOT/grubx64.efi"),
    ]
    grub_found = next((p for p in grub_candidates if p.exists()), None)
    # /mnt 마운트 여부 (ISO 마운트 감지)
    mnt_mounted = False
    try:
        r = subprocess.run(["findmnt", "-n", "-o", "SOURCE", "/mnt"],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=3)
        mnt_mounted = r.returncode == 0 and bool(r.stdout.decode().strip())
    except Exception:
        pass
    checks.append({
        "name": "설치 ISO 마운트 (/mnt)",
        "ok": mnt_mounted,
        "detail": "마운트됨" if mnt_mounted else "/mnt 에 ISO 마운트 필요 (mount /dev/sr0 /mnt)",
    })
    checks.append({
        "name": "grubx64.efi",
        "ok": grub_found is not None,
        "detail": "존재: {}".format(grub_found) if grub_found
                  else "/media/EFI/BOOT/grubx64.efi 또는 /mnt/EFI/BOOT/grubx64.efi 없음",
    })

    # pull-secret
    ps = Path("/root/pull-secret.json")
    ps2 = INSTALL_DIR / "pull-secret.json"
    ok = ps.exists() or ps2.exists()
    checks.append({
        "name": "pull-secret.json",
        "ok": ok,
        "detail": "존재" if ok else "/root/pull-secret.json 없음",
    })

    return checks


def preflight_install():
    checks = []

    # install workdir 없어야 함
    env = parse_env(ENV_FILES["install_config"])
    workdir_base = env.get("INSTALL_BASE_DIR", "/root/growin")
    workdir = Path(workdir_base)
    existing = list(workdir.glob("install_*")) if workdir.exists() else []
    checks.append({
        "name": "기존 install workdir",
        "ok": len(existing) == 0,
        "detail": "없음 (정상)" if not existing
                  else "이미 존재: {} — 삭제 후 진행".format(", ".join(e.name for e in existing[:3])),
    })

    # openshift-install 바이너리
    ocp_bin = Path(env.get("OPENSHIFT_INSTALL_BIN", "/usr/local/bin/openshift-install"))
    checks.append({
        "name": "openshift-install 바이너리",
        "ok": ocp_bin.exists(),
        "detail": "존재: {}".format(ocp_bin) if ocp_bin.exists()
                  else "{} 없음 — pre 단계 먼저 실행".format(ocp_bin),
    })

    # SSH pubkey
    ssh = Path(env.get("SSH_PUBKEY_FILE", "/root/.ssh/id_rsa.pub"))
    checks.append({
        "name": "SSH 공개키",
        "ok": ssh.exists(),
        "detail": "존재" if ssh.exists() else "{} 없음".format(ssh),
    })

    # trust bundle
    reg_env = parse_env(ENV_FILES["registry"])
    cert_dir  = Path(reg_env.get("CERT_DIR", "/etc/pki/tls/certs"))
    cert_file = reg_env.get("CERT_FILE", "registry.crt")
    cert_path = cert_dir / cert_file
    tb = Path(env.get("ADDITIONAL_TRUST_BUNDLE_FILE", ""))
    ok = tb.exists() if str(tb) else cert_path.exists()
    checks.append({
        "name": "Additional Trust Bundle",
        "ok": ok,
        "detail": "존재" if ok else "인증서 파일 없음 — 04-make-certs 먼저 실행",
    })

    return checks


def preflight_post():
    checks = []

    # oc 로그인 여부
    try:
        r = subprocess.run(["oc", "whoami"],
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5)
        ok = r.returncode == 0
        detail = r.stdout.decode().strip() if ok else "oc whoami 실패 — 클러스터 설치 완료 후 실행"
    except Exception:
        ok = False
        detail = "oc 명령어 없음 또는 로그인 안 됨"
    checks.append({"name": "oc 로그인", "ok": ok, "detail": detail})

    # auth 디렉토리
    env = parse_env(ENV_FILES["install_config"])
    workdir_base = env.get("INSTALL_BASE_DIR", "/root/growin")
    auth_dirs = list(Path(workdir_base).glob("install_*/auth")) \
                if Path(workdir_base).exists() else []
    checks.append({
        "name": "auth/ 디렉토리 (kubeconfig)",
        "ok": len(auth_dirs) > 0,
        "detail": "발견: {}".format(auth_dirs[0]) if auth_dirs else "install 단계 먼저 실행",
    })

    return checks


PREFLIGHT_MAP = {
    "pre":     preflight_pre,
    "install": preflight_install,
    "post":    preflight_post,
}




# ── env 변수 치환 ─────────────────────────────────────────────────────

def resolve_vars(val, env_map):
    """
    ${VAR_NAME} 패턴을 env_map에서 찾아 치환. 최대 5회 반복.
    $(...) 명령 치환은 건드리지 않음.
    """
    for _ in range(5):
        def replacer(m):
            return env_map.get(m.group(1), m.group(0))
        new_val = re.sub(r'\$\{([A-Z_][A-Z0-9_]*)\}', replacer, val)
        if new_val == val:
            break
        val = new_val
    return val


def resolve_all_envs():
    """
    모든 env 파일을 로드 순서대로 읽어 전체 env_map 생성 후
    각 값의 변수 치환을 시도한다.
    반환값: {
      env_name: {
        KEY: {
          "raw": "원본 값",
          "resolved": "치환된 값",
          "has_unresolved": bool,  # ${...} 남아있음
          "has_cmd": bool,         # $(...) 있음
        }
      }
    }
    """
    # run.sh 로드 순서 그대로
    load_order = ["cluster", "network", "registry", "bastion", "install_config", "post"]

    # 전체 플랫 맵 먼저 구성
    flat = {}
    for name in load_order:
        flat.update(parse_env(ENV_FILES[name]))

    result = {}
    for name in load_order:
        data = parse_env(ENV_FILES[name])
        resolved_map = {}
        for key, raw in data.items():
            resolved = resolve_vars(raw, flat)
            has_unresolved = bool(re.search(r'\$\{[A-Z_]', resolved))
            has_cmd        = bool(re.search(r'\$\(', resolved))
            resolved_map[key] = {
                "raw":            raw,
                "resolved":       resolved,
                "has_unresolved": has_unresolved,
                "has_cmd":        has_cmd,
            }
        result[name] = resolved_map
    return result

# ── 인벤토리 → env 자동 분석 ─────────────────────────────────────────

def _parse_cert_file(cert_path):
    """openssl x509로 인증서 정보 파싱."""
    try:
        r = subprocess.run(
            ['openssl', 'x509', '-noout', '-text', '-in', cert_path],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5
        )
        if r.returncode != 0:
            return {"error": r.stderr.decode().strip().split("\n")[-1]}
        text = r.stdout.decode()

        cn_m  = re.search(r'Subject:.*?CN\s*=\s*([^\n,/]+)', text)
        nb_m  = re.search(r'Not Before\s*:\s*(.+)', text)
        na_m  = re.search(r'Not After\s*:\s*(.+)', text)
        san_m = re.search(r'Subject Alternative Name:[^\n]*\n\s*(.+)', text)

        dns_names = []
        if san_m:
            dns_names = re.findall(r'DNS:([^\s,]+)', san_m.group(1))

        return {
            "cn":         cn_m.group(1).strip() if cn_m else "",
            "not_before": nb_m.group(1).strip() if nb_m else "",
            "not_after":  na_m.group(1).strip() if na_m else "",
            "dns_names":  dns_names,
            "error":      None,
        }
    except Exception as e:
        return {"error": str(e)}


def _get_registry_cert_path():
    """실행 중인 registry 컨테이너가 마운트한 인증서 경로 추출."""
    for rt in ("podman", "docker"):
        try:
            r = subprocess.run(
                [rt, "inspect", "--format",
                 "{{range .Mounts}}{{.Source}}:{{.Destination}}\n{{end}}",
                 "infra_registry"],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=5
            )
            if r.returncode != 0:
                continue
            for line in r.stdout.decode().splitlines():
                src, _, dst = line.partition(":")
                # 컨테이너 내 /certs/ 또는 /etc/pki/ 경로로 마운트된 cert
                if dst and ("/certs" in dst or "/pki" in dst) and src.endswith(".crt"):
                    return src
        except FileNotFoundError:
            continue
    return None


def _wildcard_covers(wildcard, fqdn):
    """
    wildcard가 fqdn을 커버하는지 확인.
    *.a.b.c 는 x.a.b.c 는 커버하지만 x.y.a.b.c 는 커버 안 함 (RFC 2818).
    """
    if not wildcard.startswith("*."):
        return wildcard == fqdn
    wc_suffix = wildcard[1:]   # .a.b.c
    if not fqdn.endswith(wc_suffix):
        return False
    prefix = fqdn[: len(fqdn) - len(wc_suffix)]
    return "." not in prefix and len(prefix) > 0


def get_cert_status():
    """
    env 설정 기반 인증서 파일 읽기 + hosts.txt / 레지스트리와 비교.
    """
    reg_env   = parse_env(ENV_FILES["registry"])
    cert_dir  = reg_env.get("CERT_DIR", "./certs")
    cert_file = reg_env.get("CERT_FILE", "domain.crt")

    # CERT_DIR 상대경로 → INSTALL_DIR 기준 절대경로로 변환
    cert_dir_path = Path(cert_dir)
    if not cert_dir_path.is_absolute():
        cert_dir_path = (INSTALL_DIR / cert_dir_path).resolve()
    cert_path = str(cert_dir_path / cert_file)

    result = {
        "cert_path":   cert_path,
        "cert_exists": Path(cert_path).exists(),
        "cert_info":   None,
        "warnings":    [],
        "registry_cert_path":  None,
        "registry_cert_info":  None,
        "registry_cert_match": None,
    }

    if not result["cert_exists"]:
        return result

    info = _parse_cert_file(cert_path)
    result["cert_info"] = info

    if info.get("error"):
        return result

    cert_dns = info.get("dns_names", [])
    cert_cn  = info.get("cn", "")

    # ── env에서 기대 패턴 계산 (04-make-certs.sh 로직 그대로) ────────
    cl_env       = parse_env(ENV_FILES["cluster"])
    host         = cl_env.get("HOST", "")
    cluster_name = cl_env.get("CLUSTER_NAME", "")
    base_domain  = cl_env.get("BASE_DOMAIN", "")

    if host and cluster_name and base_domain:
        name         = "{}.{}".format(cluster_name, base_domain)
        expected_cn  = "{}.{}".format(host, name)          # bastion.lgu.example.co.kr
        expected_san = [
            "*.{}".format(name),                           # *.lgu.example.co.kr
            "{}.{}".format(host, name),                    # bastion.lgu.example.co.kr
        ]

        # CN 체크 — 기대 CN과 비교
        if cert_cn and cert_cn != expected_cn:
            result["warnings"].append(
                "CN 불일치: 인증서 CN='{}' / 기대값='{}'".format(cert_cn, expected_cn))

        # SAN 체크 — 기대 SAN 항목이 인증서에 있는지
        # wildcard 실제 매칭으로 확인
        san_missing = []
        for exp in expected_san:
            # 직접 일치 또는 cert_dns 중 하나가 exp를 커버하는지
            covered = (
                exp in cert_dns or
                any(_wildcard_covers(cd, exp) for cd in cert_dns if cd.startswith("*.")) or
                (exp.startswith("*.") and exp in cert_dns)
            )
            if not covered:
                san_missing.append(exp)

        if san_missing:
            result["warnings"].append(
                "DNS SAN 불일치: 인증서에 없는 항목 — {}  (현재 SAN: {})".format(
                    ", ".join(san_missing), ", ".join(cert_dns) or "없음"))

    # ── 레지스트리 컨테이너 인증서 비교 ─────────────────────────────
    reg_cert_path = _get_registry_cert_path()
    if reg_cert_path and Path(reg_cert_path).exists():
        result["registry_cert_path"] = reg_cert_path
        reg_info = _parse_cert_file(reg_cert_path)
        result["registry_cert_info"] = reg_info
        if not reg_info.get("error"):
            same = (
                reg_info.get("cn")        == info.get("cn") and
                reg_info.get("not_after") == info.get("not_after")
            )
            result["registry_cert_match"] = same
            if not same:
                result["warnings"].append(
                    "레지스트리 컨테이너가 다른 인증서 사용 중: CN='{}' (설정: CN='{}')".format(
                        reg_info.get("cn", ""), info.get("cn", "")))

    return result


def analyze_inventory():
    """hosts.txt 분석 → env 자동 채우기."""
    hosts = parse_inventory(INVENTORY_FILE)
    if not hosts:
        return {"suggestions": {}, "notes": ["hosts.txt 가 비어있거나 없음"]}

    notes = []
    cluster = {}
    network = {}
    install_config = {}
    bastion_env = {}

    bastions  = [h for h in hosts if h["role"] == "bastion"]
    masters   = [h for h in hosts if h["role"] == "master"]
    workers   = [h for h in hosts if h["role"] == "worker"]
    bootstrap = [h for h in hosts if h["role"] == "bootstrap"]
    ha_mode   = len(bastions) >= 2

    # ── cluster.env ──────────────────────────────────────────────────
    cluster_name = ""
    base_domain  = ""
    if bastions:
        b    = bastions[0]
        fqdn = b["fqdn"]
        parts = fqdn.split(".")
        if len(parts) >= 3:
            cluster["HOST"]         = parts[0]
            cluster["CLUSTER_NAME"] = parts[1]
            cluster["BASE_DOMAIN"]  = ".".join(parts[2:])
            cluster_name = parts[1]
            base_domain  = ".".join(parts[2:])
            notes.append("HOST / CLUSTER_NAME / BASE_DOMAIN: {} 에서 추론".format(fqdn))
        elif len(parts) == 2:
            cluster["HOST"]        = parts[0]
            cluster["BASE_DOMAIN"] = parts[1]
            base_domain = parts[1]
            notes.append("HOST / BASE_DOMAIN: {} 에서 추론 (CLUSTER_NAME 확인 필요)".format(fqdn))

    # ── network.env ──────────────────────────────────────────────────

    # 인벤토리 전체 IP에서 서브넷 목록 추출 (앞 3옥텟 기준 /24)
    all_ips = [h["ip"] for h in hosts if h.get("ip") and h["ip"] not in ("-","")]
    subnets = list(dict.fromkeys(
        "{}.0/24".format(ip.rsplit(".",1)[0]) for ip in all_ips
        if len(ip.rsplit(".",1)) == 2
    ))

    if bastions:
        b0 = bastions[0]
        network["PXE_BASTION_IP"] = b0["ip"]
        notes.append("PXE_BASTION_IP: bastion01 IP ({}) 사용".format(b0["ip"]))

        if b0.get("gateway") and b0["gateway"] not in ("-",""):
            network["GATEWAY"] = b0["gateway"]

        if b0.get("nic"):
            network["NIC_NAME"] = b0["nic"].split(",")[0]

        # 서브넷 — bastion IP 기준
        ip_parts = b0["ip"].rsplit(".", 1)
        if len(ip_parts) == 2:
            network["SUBNET"] = "{}.0/24".format(ip_parts[0])

        if ha_mode:
            # HA: VIP는 bastion IP와 같은 대역에서 사용
            subnet_prefix = b0["ip"].rsplit(".", 1)[0]
            network["SERVICE_VIP"]  = "{}.xxx".format(subnet_prefix)  # 수동 입력 필요
            network["INGRESS_VIP"]  = "{}.xxx".format(subnet_prefix)
            network["DNS_SERVER"]   = "{}.xxx".format(subnet_prefix)
            notes.append("HA 모드 (bastion {}대) → SERVICE_VIP / INGRESS_VIP / DNS_SERVER: {}.xxx 형태로 채워짐 — 실제 VIP IP로 수정 필요".format(
                len(bastions), subnet_prefix))
        else:
            network["DNS_SERVER"] = b0["ip"]
            notes.append("Single bastion → DNS_SERVER = PXE_BASTION_IP ({})".format(b0["ip"]))

        # DHCP range — bastion IP 대역에서 노드 IP 범위 계산
        node_ips_in_subnet = sorted(
            [int(ip.rsplit(".",1)[1]) for ip in all_ips
             if ip.startswith(b0["ip"].rsplit(".",1)[0]+".")]
        )
        if node_ips_in_subnet:
            subnet_prefix = b0["ip"].rsplit(".",1)[0]
            last_node_octet = node_ips_in_subnet[-1]
            # 노드 IP 바로 뒤부터 20개를 DHCP 범위로
            dhcp_start = min(last_node_octet + 1, 250)
            dhcp_end   = min(dhcp_start + 19, 254)
            network["DHCP_RANGE_START"] = "{}.{}".format(subnet_prefix, dhcp_start)
            network["DHCP_RANGE_END"]   = "{}.{}".format(subnet_prefix, dhcp_end)
            notes.append("DHCP range: 노드 IP 최대값({}) 기준 뒤로 자동 계산 → {}.{} ~ {}.{}".format(
                last_node_octet, subnet_prefix, dhcp_start, subnet_prefix, dhcp_end))

        # NTP ALLOW_NETWORKS — 인벤토리 전체 서브넷
        if subnets:
            network["ALLOW_NETWORKS"] = " ".join(subnets)
            notes.append("ALLOW_NETWORKS: 인벤토리 IP 기준 서브넷 {} 개 추가".format(len(subnets)))

    if not network.get("GATEWAY"):
        for h in hosts:
            if h.get("gateway") and h["gateway"] not in ("-",""):
                network["GATEWAY"] = h["gateway"]
                break

    # ── install_config.env ───────────────────────────────────────────
    install_config["CONTROL_PLANE_REPLICAS"] = str(len(masters)) if masters else "3"
    install_config["COMPUTE_REPLICAS"] = "0"
    notes.append("CONTROL_PLANE_REPLICAS: master {}대 감지".format(len(masters)))
    notes.append("COMPUTE_REPLICAS: UPI 기준 0")

    # REGISTRY_HOSTNAME
    # HA: bastion01/bastion02 → 숫자 제거 → "bastion" (공통 prefix)
    # Single: bastion 그대로
    if bastions:
        if ha_mode:
            b0_short = bastions[0]["fqdn"].split(".")[0]
            # 숫자 suffix 제거: bastion01 → bastion
            reg_host = re.sub(r'\d+$', '', b0_short)
            notes.append("REGISTRY_HOSTNAME: HA 모드 → 숫자 제거 → '{}'".format(reg_host))
        else:
            reg_host = bastions[0]["fqdn"].split(".")[0]
            notes.append("REGISTRY_HOSTNAME: Single → '{}'".format(reg_host))
        install_config["REGISTRY_HOSTNAME"] = reg_host

        # IMAGE_MIRROR_HOST
        if cluster_name and base_domain:
            install_config["IMAGE_MIRROR_HOST"] = "{}.{}.{}:5000".format(
                reg_host, cluster_name, base_domain)

    # ── bastion.env ───────────────────────────────────────────────────
    # OC_LOGIN_SERVER
    if cluster_name and base_domain:
        bastion_env["OC_LOGIN_SERVER"] = "https://api.{}.{}:6443".format(
            cluster_name, base_domain)
        notes.append("OC_LOGIN_SERVER: cluster/domain 에서 추론")

    # ── bond NIC 감지 ────────────────────────────────────────────────
    bond_workers = [h for h in workers if h.get("nettype") == "bond"]
    if bond_workers:
        notes.append("bond worker {}대 감지: NIC={}".format(
            len(bond_workers), bond_workers[0]["nic"]))

    notes.append("총 노드: bastion={}, bootstrap={}, master={}, worker={}".format(
        len(bastions), len(bootstrap), len(masters), len(workers)))

    suggestions = {}
    if cluster:      suggestions["cluster"]        = cluster
    if network:      suggestions["network"]        = network
    if install_config: suggestions["install_config"] = install_config
    if bastion_env:  suggestions["bastion"]        = bastion_env

    return {"suggestions": suggestions, "notes": notes}

# ── install workdir 상태 ─────────────────────────────────────────────

def get_workdir_status():
    env = parse_env(ENV_FILES["install_config"])
    base = Path(env.get("INSTALL_BASE_DIR", "/root/growin"))
    if not base.exists():
        return {"base": str(base), "exists": False, "dirs": []}

    dirs = []
    for d in sorted(base.glob("install_*"), reverse=True)[:5]:
        if not d.is_dir():
            continue
        checks = {
            "manifests":     (d / "manifests").exists(),
            "openshift":     (d / "openshift").exists(),
            "auth":          (d / "auth").exists(),
            "bootstrap.ign": (d / "bootstrap.ign").exists(),
            "master.ign":    (d / "master.ign").exists(),
            "worker.ign":    (d / "worker.ign").exists(),
        }
        done = sum(1 for v in checks.values() if v)
        dirs.append({
            "name":    d.name,
            "path":    str(d),
            "checks":  checks,
            "done":    done,
            "total":   len(checks),
        })
    return {"base": str(base), "exists": True, "dirs": dirs}


# ── HTTP 핸들러 ──────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, msg):
        self.send_json({"error": msg}, status)

    def read_body_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length))

    def do_HEAD(self):
        # HEAD는 GET과 동일하게 처리하되 body만 제외
        self.do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path).path.rstrip("/")

        if p == "/api/health":
            self.send_json({"ok": True, "install_dir": str(INSTALL_DIR)})

        elif p == "/api/env":
            self.send_json({k: parse_env(v) for k, v in ENV_FILES.items()})

        elif p.startswith("/api/env/") and p.endswith("/resolved"):
            name = p[len("/api/env/"):-len("/resolved")]
            if name not in ENV_FILES:
                return self.send_error_json(404, "unknown env: {}".format(name))
            all_resolved = resolve_all_envs()
            self.send_json(all_resolved.get(name, {}))

        elif p == "/api/env/resolved":
            self.send_json(resolve_all_envs())

        elif p.startswith("/api/env/"):
            name = p[len("/api/env/"):]
            if name not in ENV_FILES:
                return self.send_error_json(404, "unknown env: {}".format(name))
            self.send_json(parse_env(ENV_FILES[name]))

        elif p == "/api/inventory":
            self.send_json({"hosts": parse_inventory(INVENTORY_FILE)})

        elif p == "/api/inventory/analyze":
            self.send_json(analyze_inventory())

        elif p == "/api/status":
            svcs = {s: service_status(s)
                    for s in ["named", "haproxy", "dhcpd", "httpd", "keepalived"]}
            # REGISTRIES_CSV 기반 복수 레지스트리 상태
            for name, status in registry_containers_status().items():
                svcs[name] = status
            self.send_json({"services": svcs})

        elif p == "/api/status/files":
            files = {
                "run_sh":     str(RUN_SH),
                "hosts_txt":  str(INVENTORY_FILE),
                "pull_secret":"/root/pull-secret.json",
                "ssh_pubkey": "/root/.ssh/id_rsa.pub",
                "grubx64":    "/media/EFI/BOOT/grubx64.efi",
            }
            self.send_json({k: {"path": v, "exists": Path(v).exists()}
                            for k, v in files.items()})

        elif p == "/api/status/tarballs":
            pre_dir = INSTALL_DIR / "01-pre"
            result = []
            if pre_dir.exists():
                for f in sorted(pre_dir.iterdir()):
                    if f.suffix in ('.gz', '.tar') or f.name.endswith('.tar.gz'):
                        result.append({"name": f.name, "path": str(f),
                                       "size": f.stat().st_size})
            self.send_json({"files": result, "count": len(result)})

        elif p == "/api/status/cos":
            cos_dir = INSTALL_DIR / "cos"
            if not cos_dir.exists():
                return self.send_json({"ok": False, "error": "cos/ not found"})
            names = [f.name for f in cos_dir.iterdir()]
            res = {}
            for key in ("kernel", "initramfs", "rootfs"):
                matched = [n for n in names if key in n]
                res[key] = {"found": len(matched) == 1, "files": matched,
                            "error": None if len(matched) == 1
                                     else ("not found" if not matched else "duplicate")}
            self.send_json({"ok": all(v["found"] for v in res.values()), "files": res})

        elif p == "/api/status/workdir":
            self.send_json(get_workdir_status())

        elif p == "/api/status/cert":
            self.send_json(get_cert_status())

        elif p.startswith("/api/preflight/"):
            mode = p[len("/api/preflight/"):]
            if mode not in PREFLIGHT_MAP:
                return self.send_error_json(400, "mode must be pre|install|post")
            checks = PREFLIGHT_MAP[mode]()
            all_ok = all(c["ok"] for c in checks)
            self.send_json({"ok": all_ok, "checks": checks})

        elif p == "/api/steps":
            self.send_json(STEPS_META)

        elif p == "/api/run/jobs":
            with _jobs_lock:
                self.send_json(list(_jobs.values()))

        elif p.startswith("/api/run/jobs/"):
            jid = p[len("/api/run/jobs/"):]
            with _jobs_lock:
                job = _jobs.get(jid)
            if not job:
                return self.send_error_json(404, "job not found")
            self.send_json(job)

        elif p.startswith("/api/run/stream/"):
            jid = p[len("/api/run/stream/"):]
            with _jobs_lock:
                job = _jobs.get(jid)
            if not job:
                return self.send_error_json(404, "job not found")
            self._sse_stream(jid)

        elif p == "" or p == "/":
            self._serve_static("index.html")

        elif not p.startswith("/api/"):
            fname = p.lstrip("/")
            self._serve_static(fname)

        else:
            self.send_error_json(404, "not found: {}".format(p))

    def do_PUT(self):
        p = urlparse(self.path).path.rstrip("/")

        if p.startswith("/api/env/"):
            name = p[len("/api/env/"):]
            if name not in ENV_FILES:
                return self.send_error_json(404, "unknown env: {}".format(name))
            body = self.read_body_json()
            path = ENV_FILES[name]
            write_env(path, body.get("data", {}),
                      original_path=path if Path(path).exists() else None)
            self.send_json({"saved": name})

        elif p == "/api/inventory":
            body = self.read_body_json()
            write_inventory(INVENTORY_FILE, body.get("hosts", []))
            self.send_json({"saved": True})

        else:
            self.send_error_json(404, "not found: {}".format(p))

    def do_POST(self):
        p = urlparse(self.path).path.rstrip("/")

        if p.startswith("/api/run/step/"):
            step = p[len("/api/run/step/"):]
            if step not in ALL_STEPS:
                return self.send_error_json(404, "unknown step: {}".format(step))
            script = ALL_STEPS[step]
            if not Path(script).exists():
                return self.send_error_json(500, "script not found: {}".format(script))
            jid = new_job(step, script)
            t = threading.Thread(target=run_script_thread,
                                 args=(jid, ["bash", script]), daemon=True)
            t.start()
            self.send_json({"job_id": jid, "step": step})

        elif p.startswith("/api/run/"):
            mode = p[len("/api/run/"):]
            if mode not in ("pre", "install", "post"):
                return self.send_error_json(400, "mode must be pre|install|post")
            if not RUN_SH.exists():
                return self.send_error_json(500, "run.sh not found: {}".format(RUN_SH))
            jid = new_job(mode, str(RUN_SH))
            t = threading.Thread(target=run_script_thread,
                                 args=(jid, ["bash", str(RUN_SH), mode]), daemon=True)
            t.start()
            self.send_json({"job_id": jid, "mode": mode})

        else:
            self.send_error_json(404, "not found: {}".format(p))

    def do_DELETE(self):
        p = urlparse(self.path).path.rstrip("/")
        if p.startswith("/api/run/jobs/"):
            jid = p[len("/api/run/jobs/"):]
            with _jobs_lock:
                if jid not in _jobs:
                    return self.send_error_json(404, "job not found")
                del _jobs[jid]
            _save_history()
            self.send_json({"deleted": jid})
        else:
            self.send_error_json(404, "not found: {}".format(p))

    def _serve_static(self, filename):
        # 절대경로로 고정 — __file__ 기준
        static_dir = Path(os.path.abspath(__file__)).parent / "static"
        if filename.startswith("static/"):
            filename = filename[len("static/"):]
        filepath = (static_dir / filename).resolve()
        try:
            filepath.relative_to(static_dir.resolve())
        except ValueError:
            return self.send_error_json(403, "forbidden")
        if not filepath.exists():
            if filename.endswith(('.js', '.css', '.ico', '.png', '.svg')):
                return self.send_error_json(404, "not found: " + filename)
            filepath = static_dir / "index.html"
            if not filepath.exists():
                return self.send_error_json(404, "index.html not found")
        ext = filepath.suffix.lower()
        mime = {
            ".html": "text/html; charset=utf-8",
            ".js":   "application/javascript",
            ".css":  "text/css",
            ".json": "application/json",
            ".ico":  "image/x-icon",
            ".png":  "image/png",
            ".svg":  "image/svg+xml",
        }.get(ext, "application/octet-stream")
        body = filepath.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _sse_stream(self, jid):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        sent = 0
        try:
            while True:
                with _jobs_lock:
                    job    = _jobs[jid]
                    logs   = job["logs"][:]
                    status = job["status"]
                while sent < len(logs):
                    line = logs[sent].replace("\n", " ")
                    self.wfile.write("data: {}\n\n".format(line).encode())
                    self.wfile.flush()
                    sent += 1
                if status != "running":
                    rc = job.get("returncode", -1)
                    self.wfile.write("event: done\ndata: {}:{}\n\n".format(status, rc).encode())
                    self.wfile.flush()
                    break
                time.sleep(0.3)
        except (BrokenPipeError, ConnectionResetError):
            pass


# ── 진입점 ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument("--host", default="0.0.0.0")
    args = parser.parse_args()

    _load_history()

    print("[INFO] INSTALL_DIR = {}".format(INSTALL_DIR))
    print("[INFO] run.sh      = {} ({})".format(RUN_SH, "found" if RUN_SH.exists() else "NOT FOUND"))
    print("[INFO] Listening   = http://{}:{}".format(args.host, args.port))
    print()
    print("  접속 방법:")
    print("  - bastion 직접:  http://<bastion-ip>:{}".format(args.port))
    print("  - 포트포워딩:    ssh -L {p}:localhost:{p} root@<bastion-ip>".format(p=args.port))

    server = HTTPServer((args.host, args.port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] server stopped")
