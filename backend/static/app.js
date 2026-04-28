/* OCP Installer UI - app.js */
const API = '';

// ── 변수 카테고리 & 설명 ──────────────────────────────────────────────
const ENV_CATEGORIES = {
  cluster: [
    { title: '기본 정보', badge: 'badge-blue', keys: ['HOST','CLUSTER_NAME','BASE_DOMAIN','OFFLINE'] },
    { title: 'API / 접속', badge: 'badge-gray', keys: ['API_SERVER','BASTION_HOST_PATTERN'] },
  ],
  network: [
    { title: 'IP 주소', badge: 'badge-blue', keys: ['PXE_BASTION_IP','SERVICE_VIP','INGRESS_VIP','DNS_SERVER'] },
    { title: 'NIC / VLAN', badge: 'badge-gray', keys: ['NIC_NAME','VLAN_ID'] },
    { title: '서브넷 / DHCP', badge: 'badge-teal', keys: ['SUBNET','GATEWAY','PXE_NETMASK','SERVICE_NETMASK','DHCP_RANGE_START','DHCP_RANGE_END'] },
    { title: '기타', badge: 'badge-gray', keys: ['NTP_SERVERS','ALLOW_NETWORKS'] },
  ],
  registry: [
    { title: '레지스트리', badge: 'badge-purple', keys: ['REGISTRIES_CSV','REGISTRY_CONTAINER_PORT','BASE_REGISTRY_IMAGE','REGISTRY_TAG','REGISTRY_TAR_FILE'] },
    { title: '인증서', badge: 'badge-amber', keys: ['CERT_DIR','CERT_FILE','KEY_FILE','CERT_IF_EXISTS'] },
  ],
  bastion: [
    { title: 'SSH / Root', badge: 'badge-red', keys: ['DISABLE_ROOT_SSH','ROOT_PASSWORD'] },
    { title: '사용자 계정', badge: 'badge-blue', keys: ['CREATE_EXTRA_USER','EXTRA_USER_NAME','EXTRA_USER_GROUPS','EXTRA_USER_SUDO_NOPASSWD','EXTRA_USER_PASSWORD'] },
    { title: 'oc 자동 로그인', badge: 'badge-teal', keys: ['ENABLE_OC_AUTO_LOGIN','OC_LOGIN_USER','OC_LOGIN_PASSWORD','OC_LOGIN_SERVER'] },
  ],
  install_config: [
    { title: '설치 경로', badge: 'badge-blue', keys: ['INSTALL_BASE_DIR','INSTALL_WORKDIR','SOURCE_INSTALL_CONFIG_FILE','INSTALL_CONFIG_FILE','OPENSHIFT_INSTALL_BIN'] },
    { title: '인증 / 키', badge: 'badge-amber', keys: ['PULL_SECRET_FILE','SSH_PUBKEY_FILE','ADDITIONAL_TRUST_BUNDLE_FILE'] },
    { title: '클러스터 네트워크', badge: 'badge-teal', keys: ['CLUSTER_NETWORK_CIDR','CLUSTER_NETWORK_HOST_PREFIX','SERVICE_NETWORK_CIDR','NETWORK_TYPE','INSTALL_PLATFORM'] },
    { title: '노드 수', badge: 'badge-gray', keys: ['CONTROL_PLANE_REPLICAS','COMPUTE_REPLICAS'] },
    { title: '이미지 미러', badge: 'badge-purple', keys: ['REGISTRY_HOSTNAME','IMAGE_MIRROR_HOST','IMAGE_MIRROR_PATH','IMAGE_SOURCE_RELEASE','IMAGE_SOURCE_CONTENT'] },
    { title: 'COS 파일', badge: 'badge-gray', keys: ['COS_SOURCE_DIR','COS_KERNEL_MATCH','COS_INITRAMFS_MATCH','COS_ROOTFS_MATCH'] },
    { title: 'Ignition HTTP', badge: 'badge-blue', keys: ['IGNITION_HTTP_HOST','IGNITION_HTTP_PORT','IGNITION_BASE_URL'] },
    { title: 'MachineConfig 초기화', badge: 'badge-teal', keys: ['MC_INIT_ENABLE','MC_INIT_COPY_TO_MANIFESTS','MC_ENABLE_CHRONY','MC_ENABLE_REGISTRIES','MC_ENABLE_CORE_PASSWORD','MC_ENABLE_ROOT_PASSWORD','MC_ENABLE_THP','MC_ENABLE_STATIC'] },
    { title: '비밀번호', badge: 'badge-red', keys: ['MC_CORE_PASSWORD','MC_ROOT_PASSWORD'] },
    { title: 'Huge Pages (THP)', badge: 'badge-gray', keys: ['MC_THP_ISOLCPUS','MC_THP_HUGEPAGESZ','MC_THP_HUGEPAGES','MC_THP_DISABLE_TRANSPARENT_HUGEPAGE'] },
  ],
  post: [
    { title: 'Ingress', badge: 'badge-blue', keys: ['INGRESS_REPLICAS','TARGET_NODE_ROLE_KEY','TARGET_TOLERATION_KEY','TARGET_TOLERATION_EFFECT'] },
    { title: 'OVN 네트워크', badge: 'badge-purple', keys: ['ROUTING_VIA_HOST','IP_FORWARDING_MODE'] },
    { title: 'OperatorHub 카탈로그', badge: 'badge-teal', keys: ['DISABLE_ALL_DEFAULT_SOURCES','ENABLE_REDHAT_OPERATORS','ENABLE_COMMUNITY_OPERATORS','ENABLE_CERTIFIED_OPERATORS','ENABLE_MARKETPLACE_OPERATORS'] },
  ],
};

const VAR_DESC = {
  HOST:'Bastion 호스트의 짧은 이름. FQDN의 첫 번째 부분.',
  CLUSTER_NAME:'설치할 OpenShift 클러스터 이름. DNS 및 인증서에 사용됨.',
  BASE_DOMAIN:'클러스터 기본 도메인. API/앱 URL의 기반. 예: example.com',
  API_SERVER:'OpenShift API 서버 엔드포인트. 자동 생성되며 보통 수정 불필요.',
  BASTION_HOST_PATTERN:'Bastion 호스트를 인벤토리에서 식별하는 패턴.',
  OFFLINE:'오프라인(폐쇄망) 설치 여부. true면 외부 인터넷 없이 설치.',
  PXE_BASTION_IP:'Bastion 서버 IP. PXE 부팅 시 노드들이 이 IP로 파일을 받음.',
  SERVICE_VIP:'HA 구성(bastion 2대 이상) 시 API 서비스용 가상 IP (VIP).',
  INGRESS_VIP:'HA 구성 시 앱 인그레스용 가상 IP (VIP).',
  DNS_SERVER:'DNS 서버 IP. bastion 1대면 PXE_BASTION_IP와 동일.',
  NTP_SERVERS:'NTP 시간 동기화 서버. 클러스터 노드 시간 동기화에 사용.',
  ALLOW_NETWORKS:'HAProxy 및 서비스 접근 허용 네트워크 대역.',
  NIC_NAME:'기본 네트워크 인터페이스 이름. 예: ens3, eth0',
  VLAN_ID:'VLAN 사용 시 VLAN ID. ethernet이면 0.',
  PXE_NETMASK:'PXE 네트워크 서브넷 마스크.',
  SERVICE_NETMASK:'서비스 네트워크 서브넷 마스크.',
  SUBNET:'전체 네트워크 서브넷 주소. 예: 192.168.200.0/24',
  GATEWAY:'네트워크 게이트웨이 IP.',
  DHCP_RANGE_START:'DHCP 동적 할당 범위 시작 IP.',
  DHCP_RANGE_END:'DHCP 동적 할당 범위 끝 IP.',
  REGISTRY_CONTAINER_PORT:'미러 레지스트리 컨테이너 포트. 기본 5000.',
  BASE_REGISTRY_IMAGE:'레지스트리 컨테이너 이미지. 예: docker.io/library/registry:2',
  CERT_DIR:'TLS 인증서가 저장되는 디렉토리 경로.',
  CERT_FILE:'TLS 인증서 파일 이름.',
  KEY_FILE:'TLS 개인키 파일 이름.',
  CERT_IF_EXISTS:'인증서가 이미 있을 때 동작. fail=실패 / skip=건너뜀 / replace=재생성.',
  REGISTRY_TAR_FILE:'레지스트리 이미지 tar 파일 경로. 오프라인 설치 시 사용.',
  REGISTRY_TAG:'레지스트리 이미지 태그.',
  REGISTRIES_CSV:'멀티 레지스트리 설정. 형식: name|path|port,name2|path2|port2',
  CREATE_EXTRA_USER:'추가 사용자 생성 여부. yes/no',
  EXTRA_USER_NAME:'생성할 추가 사용자 이름.',
  EXTRA_USER_GROUPS:'추가 사용자가 속할 그룹 목록.',
  EXTRA_USER_SUDO_NOPASSWD:'sudo 비밀번호 없이 실행 허용. yes/no',
  ENABLE_OC_AUTO_LOGIN:'.bashrc에 oc 자동 로그인 명령 추가 여부. yes/no',
  OC_LOGIN_USER:'oc 자동 로그인 사용자 이름.',
  OC_LOGIN_PASSWORD:'oc 자동 로그인 비밀번호.',
  OC_LOGIN_SERVER:'oc 자동 로그인 API 서버 주소.',
  INSTALL_BASE_DIR:'설치 작업 기본 디렉토리. 기본: /root/growin',
  INSTALL_WORKDIR:'설치 작업 디렉토리. 날짜 포함 자동 생성됨.',
  SOURCE_INSTALL_CONFIG_FILE:'install-config.yaml 원본 경로. installer가 복사본을 소비함.',
  INSTALL_CONFIG_FILE:'작업용 install-config.yaml 복사본 경로.',
  OPENSHIFT_INSTALL_BIN:'openshift-install 바이너리 경로.',
  PULL_SECRET_FILE:'Red Hat pull secret 파일 경로. quay.io 등 인증에 사용.',
  SSH_PUBKEY_FILE:'노드에 등록할 SSH 공개키 파일 경로.',
  ADDITIONAL_TRUST_BUNDLE_FILE:'추가 신뢰 CA 인증서 파일. 내부 미러 레지스트리 인증서 등.',
  REGISTRY_HOSTNAME:'미러 레지스트리 호스트명. 기본: bastion 호스트명.',
  CONTROL_PLANE_REPLICAS:'Master 노드 수. 일반적으로 3.',
  COMPUTE_REPLICAS:'Worker 노드 수. UPI(platform:none)에서는 0으로 설정.',
  CLUSTER_NETWORK_CIDR:'Pod 네트워크 CIDR. 클러스터 내부 Pod IP 대역.',
  CLUSTER_NETWORK_HOST_PREFIX:'Pod 네트워크 노드별 프리픽스 길이.',
  SERVICE_NETWORK_CIDR:'Service(ClusterIP) 네트워크 CIDR.',
  INSTALL_PLATFORM:'설치 플랫폼. none=UPI (수동 노드 프로비저닝).',
  NETWORK_TYPE:'네트워크 플러그인. OVNKubernetes 권장.',
  IMAGE_MIRROR_HOST:'이미지 미러 레지스트리 호스트:포트.',
  IMAGE_MIRROR_PATH:'미러 레지스트리 내 이미지 저장 경로.',
  IMAGE_SOURCE_RELEASE:'원본 릴리즈 이미지 경로 (quay.io 등).',
  IMAGE_SOURCE_CONTENT:'원본 컨텐츠 이미지 경로.',
  COS_SOURCE_DIR:'CoreOS 부팅 파일(kernel/initramfs/rootfs) 디렉토리.',
  COS_KERNEL_MATCH:'kernel 파일 식별용 문자열.',
  COS_INITRAMFS_MATCH:'initramfs 파일 식별용 문자열.',
  COS_ROOTFS_MATCH:'rootfs 파일 식별용 문자열.',
  MC_INIT_ENABLE:'MachineConfig 초기화 렌더 활성화 여부. yes/no',
  MC_INIT_COPY_TO_MANIFESTS:'렌더된 MC를 manifests에 포함할지 여부. yes/no',
  MC_ENABLE_CHRONY:'Chrony(시간동기화) MachineConfig 적용 여부. yes/no',
  MC_ENABLE_REGISTRIES:'레지스트리 설정 MachineConfig 적용 여부. yes/no',
  MC_ENABLE_CORE_PASSWORD:'core 사용자 비밀번호 설정 여부. yes/no',
  MC_ENABLE_ROOT_PASSWORD:'root 사용자 비밀번호 설정 여부. yes/no',
  MC_ENABLE_THP:'Huge Pages 설정 MachineConfig 적용 여부. yes/no',
  MC_ENABLE_STATIC:'iscsi-scan-add / multipath / ssh-password-login / timezone 등 static MC 파일을 mc_init/ 에서 manifests로 복사. yes/no',
  MC_CORE_PASSWORD:'core 사용자 비밀번호 (평문 입력, 스크립트가 해시 처리).',
  MC_ROOT_PASSWORD:'root 사용자 비밀번호 (평문 입력, 스크립트가 해시 처리).',
  MC_THP_ISOLCPUS:'Huge Pages용 CPU 격리 설정.',
  MC_THP_HUGEPAGESZ:'Huge Page 크기. 예: 1G',
  MC_THP_HUGEPAGES:'Huge Page 수량.',
  MC_THP_DISABLE_TRANSPARENT_HUGEPAGE:'Transparent Huge Page 비활성화 여부. yes/no',
  ROUTING_VIA_HOST:'OVN 라우팅을 호스트 네트워크 스택으로 처리. 5G CNF 환경 필요. true/false',
  IGNITION_HTTP_HOST:'Ignition 파일을 서빙하는 HTTP 호스트. 기본: bastion FQDN.',
  IGNITION_HTTP_PORT:'Ignition HTTP 서버 포트. 기본: 8080.',
  IGNITION_BASE_URL:'Ignition 파일 기본 URL. 노드 부팅 시 이 주소로 ign 파일을 내려받음.',
  DISABLE_ROOT_SSH:'root SSH 로그인 비활성화 여부. yes/no',
  ROOT_PASSWORD:'root 계정 비밀번호.',
  EXTRA_USER_PASSWORD:'추가 사용자 비밀번호.',
  INGRESS_REPLICAS:'Ingress 컨트롤러 replica 수. master 수와 맞추는 게 일반적.',
  TARGET_NODE_ROLE_KEY:'Ingress를 배치할 노드 역할 라벨.',
  TARGET_TOLERATION_KEY:'Ingress 배치 시 toleration key.',
  TARGET_TOLERATION_EFFECT:'Ingress 배치 시 toleration effect.',
  DISABLE_ALL_DEFAULT_SOURCES:'기본 OperatorHub 카탈로그 소스 전체 비활성화. true/false',
  ENABLE_REDHAT_OPERATORS:'Red Hat Operators 카탈로그 활성화. true/false',
  ENABLE_COMMUNITY_OPERATORS:'Community Operators 카탈로그 활성화. true/false',
  ENABLE_CERTIFIED_OPERATORS:'Certified Operators 카탈로그 활성화. true/false',
  ENABLE_MARKETPLACE_OPERATORS:'Marketplace Operators 카탈로그 활성화. true/false',
  IP_FORWARDING_MODE:'IP 포워딩 모드. Global=전체 활성화, Restricted=제한적 활성화.',
};

// ── 단계 카테고리 ─────────────────────────────────────────────────────
const RUN_META = {
  pre: {
    title: 'Pre — Bastion 준비',
    desc:  'DNS, HAProxy, DHCP, PXE, Registry 등 설치 전 서비스 구성',
    groups: [
      { title: '바이너리 & 시스템', badge: 'badge-gray', steps: [
        { id:'00-command-extract',   desc:'helm, oc, kubectl, openshift-install 바이너리 tar에서 추출 설치' },
        { id:'01-disable-selinux',   desc:'SELinux Permissive 모드로 변경' },
        { id:'02-bastion-account',   desc:'추가 사용자 계정 생성 및 sudoers, .bashrc 설정' },
        { id:'03-bastion-chrony',    desc:'Chrony NTP 서버 설정. 클러스터 노드 시간 동기화 기준' },
      ]},
      { title: '인증서 & 레지스트리', badge: 'badge-amber', steps: [
        { id:'04-make-certs',        desc:'미러 레지스트리용 TLS 자체 서명 인증서 생성' },
        { id:'05-registry',          desc:'미러 레지스트리 컨테이너 생성 및 systemd 서비스 등록/시작' },
      ]},
      { title: '네트워크 서비스', badge: 'badge-blue', steps: [
        { id:'06-hosts-render',      desc:'/etc/hosts 파일에 클러스터 노드 항목 추가' },
        { id:'07-dns-render',        desc:'named.conf 및 zone 파일 생성, DNS 서비스 재시작' },
        { id:'08-haproxy-render',    desc:'HAProxy 설정 생성 (6443/22623/80/443), 재시작' },
      ]},
      { title: 'PXE / 부팅', badge: 'badge-teal', steps: [
        { id:'09-tftp-install',      desc:'TFTP 서버 설정 및 grubx64.efi 파일 배치' },
        { id:'10-dhcp-render',       desc:'DHCP 설정 생성 (MAC 기반 IP 고정 예약), 서비스 시작' },
        { id:'11-pxe-grub-render',   desc:'MAC별 PXE/GRUB 설정 파일 생성. 노드 부팅 시 자동 OS 설치' },
      ]},
      { title: 'HA / 웹 서버', badge: 'badge-purple', steps: [
        { id:'12-keepalived-render', desc:'HA 구성 시 Keepalived VIP 설정. bastion 1대면 자동 skip' },
        { id:'13-httpd',             desc:'HTTP 서버 설정. ignition 파일과 rootfs 파일 서빙' },
      ]},
    ],
  },
  install: {
    title: 'Install — 클러스터 설치',
    desc:  'install-config → manifests → ignition → artifacts publish',
    groups: [
      { title: '설정 파일 생성', badge: 'badge-blue', steps: [
        { id:'00-install-config-render', desc:'install-config.yaml 생성. pull-secret, 인증서, 네트워크 설정 포함' },
        { id:'01-manifests-generate',    desc:'openshift-install create manifests 실행' },
        { id:'01a-mc-init-render',       desc:'MachineConfig 초기화 파일 렌더링. chrony/registries/password 등' },
      ]},
      { title: 'Ignition 생성 & 배포', badge: 'badge-teal', steps: [
        { id:'02-ignition-generate',     desc:'bootstrap.ign, master.ign, worker.ign 생성' },
        { id:'03-publish-artifacts',     desc:'ignition 파일과 COS 파일을 HTTP/TFTP 서버에 배포' },
      ]},
      { title: '완료 처리', badge: 'badge-gray', steps: [
        { id:'05-bootstrap-cmd',         desc:'Bootstrap 완료 대기 명령 출력 및 실행' },
        { id:'06-kubeconfig',            desc:'kubeconfig 파일을 auth/ 디렉토리에서 복사' },
      ]},
    ],
  },
  post: {
    title: 'Post — 사후 처리',
    desc:  '클러스터 설치 완료 후 리소스 후처리',
    groups: [
      { title: '사용자 & 인그레스', badge: 'badge-blue', steps: [
        { id:'00-admin-user',        desc:'OpenShift 관리자 사용자 생성' },
        { id:'01-ingress-master',    desc:'Ingress 컨트롤러를 master 노드에 배치' },
      ]},
      { title: '네트워크 & 모니터링', badge: 'badge-teal', steps: [
        { id:'02-whereabouts',       desc:'Whereabouts IP 주소 관리 플러그인 설정' },
        { id:'03-user-workload-mon', desc:'사용자 워크로드 모니터링 활성화' },
        { id:'04-routing-via-host',  desc:'OVN routingViaHost 설정. 5G CNF 환경에서 필요' },
      ]},
      { title: 'Operator', badge: 'badge-purple', steps: [
        { id:'05-catalog-sources',   desc:'OperatorHub 카탈로그 소스 활성화' },
      ]},
    ],
  },
};

// ── 유틸 ─────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = {method, headers:{'Content-Type':'application/json'}};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  if (!r.ok) {
    const e = await r.json().catch(()=>({error:r.statusText}));
    throw new Error(e.error || r.statusText);
  }
  return r.json();
}
function toast(msg, type='ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show '+type;
  clearTimeout(el._t); el._t = setTimeout(()=>el.className='', 2500);
}
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtBytes(b) {
  if (b<1048576) return (b/1024).toFixed(1)+' KB';
  return (b/1048576).toFixed(1)+' MB';
}
function fmtTime(ts) {
  if (!ts) return '-';
  return new Date(ts*1000).toLocaleString('ko-KR');
}
function svcClass(s) { return {active:'active',inactive:'inactive',failed:'failed'}[s]||'unknown'; }
function logClass(l) {
  if (/\[OK\]|success/i.test(l))         return 'ok';
  if (/\[ERROR\]|error|failed/i.test(l)) return 'err';
  if (/\[WARN\]/i.test(l))               return 'warn';
  return 'info';
}
function appendLog(box, line) {
  const s = document.createElement('span');
  s.className = logClass(line); s.textContent = line+'\n';
  box.appendChild(s); box.scrollTop = box.scrollHeight;
}

// ── Dirty 감지 ────────────────────────────────────────────────────────
let _dirty = false;
let _invDirty = false;
function markDirty() { _dirty=true; const b=document.getElementById('dirty-badge'); if(b) b.classList.remove('hidden'); }
function clearDirty() { _dirty=false; }
function guardDirty(cb) {
  if (_dirty||_invDirty) { if(!confirm('저장하지 않은 변경사항이 있습니다. 이동하시겠습니까?')) return; clearDirty(); _invDirty=false; }
  cb();
}

// ── 라우터 ────────────────────────────────────────────────────────────
function navigate(page) { guardDirty(()=>_navigate(page)); }
function _navigate(page) {
  clearDirty(); _invDirty=false;
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active', el.dataset.page===page));
  document.getElementById('page-status').classList.toggle('hidden', page!=='status');
  document.getElementById('page-env').classList.toggle('hidden', !page.startsWith('env-'));
  document.getElementById('page-inventory').classList.toggle('hidden', page!=='inventory');
  document.getElementById('page-run').classList.toggle('hidden', !page.startsWith('run-'));
  document.getElementById('page-history').classList.toggle('hidden', page!=='history');
  const map = {
    status: renderStatus,
    'env-cluster':        ()=>renderEnv('cluster','클러스터 설정'),
    'env-network':        ()=>renderEnv('network','네트워크 설정'),
    'env-registry':       ()=>renderEnv('registry','레지스트리 설정'),
    'env-install_config': ()=>renderEnv('install_config','Install Config'),
    'env-bastion':        ()=>renderEnv('bastion','Bastion 설정'),
    'env-post':           ()=>renderEnv('post','Post 설정'),
    inventory:   renderInventory,
    'run-pre':   ()=>renderRun('pre'),
    'run-install':()=>renderRun('install'),
    'run-post':  ()=>renderRun('post'),
    history:     renderHistory,
  };
  if (map[page]) map[page]();
}

// ── 대시보드 ──────────────────────────────────────────────────────────
async function renderStatus() {
  document.getElementById('page-status').innerHTML = `
    <div class="page-header">
      <div><div class="page-title">대시보드</div>
           <div class="page-desc">서비스 상태 및 설치 준비 현황</div></div>
      <button onclick="renderStatus()">새로고침</button>
    </div>
    <div class="stat-grid" id="stat-grid">
      <div class="stat-card info"><div class="stat-label">로딩 중</div><div class="stat-value">—</div></div>
    </div>
    <div class="card"><div class="card-title">서비스 상태</div>
      <div class="status-grid" id="svc-grid">로딩 중...</div></div>
    <div class="card"><div class="card-title">주요 파일</div>
      <div class="file-list" id="file-list">로딩 중...</div></div>
    <div class="card"><div class="card-title">01-pre 바이너리 tar 파일</div>
      <div class="file-list" id="tarball-list">로딩 중...</div></div>
    <div class="card"><div class="card-title">COS 파일 (kernel / initramfs / rootfs)</div>
      <div id="cos-status">로딩 중...</div></div>
    <div class="card"><div class="card-title">Install 작업 디렉토리</div>
      <div id="workdir-status">로딩 중...</div></div>
    <div class="card"><div class="card-title">인증서 상태</div>
      <div id="cert-status">로딩 중...</div></div>
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>백업 파일 (.bak)</span>
        <button class="small amber" onclick="openCleanupModal()">정리하기</button>
      </div>
      <div id="bak-status">로딩 중...</div>
    </div>`;

  // 클러스터 라벨
  try {
    const env = await api('GET', '/api/env/cluster');
    document.getElementById('cluster-label').textContent =
      (env.CLUSTER_NAME||'') + '.' + (env.BASE_DOMAIN||'');
  } catch(_) {}

  // stat 카드
  try {
    const [{services}, files, {hosts}, cos] = await Promise.all([
      api('GET','/api/status'),
      api('GET','/api/status/files'),
      api('GET','/api/inventory'),
      api('GET','/api/status/cos'),
    ]);
    const activeCount = Object.values(services).filter(s=>s==='active').length;
    const totalSvc    = Object.keys(services).length;
    const fileOk      = Object.values(files).filter(f=>f.exists).length;
    const fileTotal   = Object.keys(files).length;
    const nodeCount   = hosts.length;
    const cosOk       = cos.ok;

    document.getElementById('stat-grid').innerHTML = `
      <div class="stat-card ${activeCount===totalSvc?'ok':'warn'}">
        <div class="stat-label">서비스 활성</div>
        <div class="stat-value">${activeCount}<span style="font-size:14px;color:var(--text3)"> / ${totalSvc}</span></div>
        <div class="stat-sub">${activeCount===totalSvc?'모두 실행 중':'일부 비활성'}</div>
      </div>
      <div class="stat-card ${fileOk===fileTotal?'ok':'warn'}">
        <div class="stat-label">필수 파일</div>
        <div class="stat-value">${fileOk}<span style="font-size:14px;color:var(--text3)"> / ${fileTotal}</span></div>
        <div class="stat-sub">${fileOk===fileTotal?'모두 존재':'누락 파일 있음'}</div>
      </div>
      <div class="stat-card info">
        <div class="stat-label">인벤토리 노드</div>
        <div class="stat-value">${nodeCount}</div>
        <div class="stat-sub">hosts.txt 기준</div>
      </div>
      <div class="stat-card ${cosOk?'ok':'error'}">
        <div class="stat-label">COS 파일</div>
        <div class="stat-value">${cosOk?'준비됨':'누락'}</div>
        <div class="stat-sub">kernel / initramfs / rootfs</div>
      </div>`;

    document.getElementById('svc-grid').innerHTML =
      Object.entries(services).map(([n,s])=>
        `<div class="status-card"><div class="svc-name">${n}</div>
         <div class="svc-state ${svcClass(s)}">${s}</div></div>`).join('');

    document.getElementById('file-list').innerHTML =
      Object.entries(files).map(([n,i])=>
        `<div class="file-row"><div><div class="file-name">${n}</div>
         <div class="file-path">${i.path}</div></div>
         <span class="badge ${i.exists?'badge-green':'badge-red'}">${i.exists?'존재':'없음'}</span></div>`).join('');
  } catch(e) { document.getElementById('svc-grid').textContent='오류: '+e.message; }

  try {
    const {files,count} = await api('GET','/api/status/tarballs');
    document.getElementById('tarball-list').innerHTML = count===0
      ? `<div class="file-row"><span style="color:var(--text3)">01-pre/ 에 tar/tar.gz 파일 없음</span>
         <span class="badge badge-amber">없음</span></div>`
      : files.map(f=>`<div class="file-row"><div><div class="file-name">${f.name}</div>
          <div class="file-path">${f.path}</div></div>
          <span class="badge badge-blue">${fmtBytes(f.size)}</span></div>`).join('');
  } catch(e) { document.getElementById('tarball-list').textContent='오류: '+e.message; }

  try {
    const cos = await api('GET','/api/status/cos');
    document.getElementById('cos-status').innerHTML = (!cos.ok&&cos.error)
      ? `<span class="badge badge-red">${cos.error}</span>`
      : Object.entries(cos.files||{}).map(([k,i])=>
          `<div class="file-row"><div><div class="file-name">${k}</div>
           <div class="file-path">${(i.files&&i.files[0])||'-'}</div></div>
           <span class="badge ${i.found?'badge-green':'badge-red'}">${i.error||'정상'}</span></div>`).join('');
  } catch(e) { document.getElementById('cos-status').textContent='오류: '+e.message; }

  try {
    const wd = await api('GET','/api/status/workdir');
    const el = document.getElementById('workdir-status');
    if (!wd.exists||wd.dirs.length===0) {
      el.innerHTML=`<div class="file-row"><span style="color:var(--text3)">${wd.base} — 아직 install 실행 전</span>
        <span class="badge badge-gray">없음</span></div>`;
    } else {
      el.innerHTML = wd.dirs.map(d=>{
        const pct=Math.round(d.done/d.total*100);
        return `<div class="workdir-row">
          <div class="workdir-name">${d.name}</div>
          <div class="workdir-checks">${Object.entries(d.checks).map(([k,v])=>
            `<span class="wc-badge ${v?'wc-ok':'wc-no'}">${k}</span>`).join('')}</div>
          <div class="workdir-bar"><div class="workdir-fill" style="width:${pct}%"></div></div>
          <span class="badge ${pct===100?'badge-green':'badge-blue'}">${d.done}/${d.total}</span>
        </div>`;
      }).join('');
    }
  } catch(e) { document.getElementById('workdir-status').textContent='오류: '+e.message; }

  try {
    const cert = await api('GET','/api/status/cert');
    const el = document.getElementById('cert-status');
    if (!cert.cert_exists) {
      el.innerHTML=`<div class="file-row">
        <div><div class="file-name">인증서 없음</div>
        <div class="file-path">${escHtml(cert.cert_path)}</div></div>
        <span class="badge badge-gray">미생성</span></div>`;
    } else {
      const info = cert.cert_info || {};
      const warns = cert.warnings || [];
      const warnHtml = warns.map(w=>
        `<div class="cert-warn">⚠ ${escHtml(w)}</div>`).join('');

      // 레지스트리 cert 비교
      let regHtml = '';
      if (cert.registry_cert_path) {
        const match = cert.registry_cert_match;
        regHtml = `<div class="cert-row" style="margin-top:10px;padding-top:10px;border-top:0.5px solid var(--border)">
          <span class="cert-label">레지스트리 사용 인증서</span>
          <span class="badge ${match?'badge-green':'badge-red'}">${match?'일치':'불일치'}</span>
        </div>
        <div class="cert-path">${escHtml(cert.registry_cert_path)}</div>`;
      }

      el.innerHTML=`
        ${warns.length ? `<div class="cert-warns">${warnHtml}</div>` : ''}
        <div class="cert-grid">
          <div class="cert-row"><span class="cert-label">경로</span>
            <span class="cert-val mono">${escHtml(cert.cert_path)}</span></div>
          <div class="cert-row"><span class="cert-label">CN</span>
            <span class="cert-val mono">${escHtml(info.cn||'-')}</span></div>
          <div class="cert-row"><span class="cert-label">유효 시작</span>
            <span class="cert-val">${escHtml(info.not_before||'-')}</span></div>
          <div class="cert-row"><span class="cert-label">만료</span>
            <span class="cert-val">${escHtml(info.not_after||'-')}</span></div>
          <div class="cert-row"><span class="cert-label">DNS SAN</span>
            <span class="cert-val mono">${(info.dns_names||[]).map(d=>
              `<span class="dns-tag">${escHtml(d)}</span>`).join(' ')}</span></div>
        </div>
        ${regHtml}`;
    }
  } catch(e) { document.getElementById('cert-status').textContent='오류: '+e.message; }

  // 백업 파일 스캔
  try {
    const bak = await api('GET', '/api/cleanup/bak');
    const el = document.getElementById('bak-status');
    if (bak.total_count === 0) {
      el.innerHTML = `<div class="file-row">
        <span style="color:var(--text3)">정리할 백업 파일 없음</span>
        <span class="badge badge-green">깨끗함</span></div>`;
    } else {
      const mb = (bak.total_size / 1048576).toFixed(1);
      // 원본 기준 그룹 집계
      const groups = {};
      bak.to_delete.forEach(f => {
        groups[f.orig] = (groups[f.orig]||0) + 1;
      });
      el.innerHTML = `
        <div class="file-row" style="margin-bottom:8px">
          <span style="color:var(--amber);font-weight:600">백업 파일 ${bak.total_count}개 발견</span>
          <span class="badge badge-amber">${mb} MB</span>
        </div>
        ${Object.entries(groups).slice(0,5).map(([orig, cnt]) =>
          `<div class="file-row" style="padding:5px 10px">
            <span class="file-path">${escHtml(orig)}</span>
            <span class="badge badge-gray">${cnt}개</span>
          </div>`).join('')}
        ${Object.keys(groups).length > 5
          ? `<div style="font-size:11px;color:var(--text3);padding:4px 10px">... 외 ${Object.keys(groups).length-5}개 파일</div>` : ''}`;
    }
  } catch(e) { document.getElementById('bak-status').textContent='오류: '+e.message; }
}

// ── ENV 편집 ──────────────────────────────────────────────────────────
async function renderEnv(name, title) {
  clearDirty();
  const _LOAD_ORDER = {cluster:1,network:2,registry:3,bastion:4,install_config:5,post:6};
  const loadOrder = _LOAD_ORDER[name] || '?';
  document.getElementById('page-env').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">${title}</div>
        <div class="page-desc" style="display:flex;align-items:center;gap:8px;margin-top:4px">
          <span>${name}.env</span>
          <span class="badge badge-gray">로드 순서 ${loadOrder}/6</span>
          <span style="font-size:11px;color:var(--text3)">— 이전 번호 env 변수를 참조 가능</span>
        </div>
      </div>
      <span id="dirty-badge" class="badge badge-amber hidden">미저장</span>
    </div>
    <div id="env-form"><div class="card" style="color:var(--text3)">로딩 중...</div></div>`;

  try {
    const [data, resolved] = await Promise.all([
      api('GET', `/api/env/${name}`),
      api('GET', `/api/env/${name}/resolved`).catch(()=>({})),
    ]);

    const categories = ENV_CATEGORIES[name] || [{title:'기타', badge:'badge-gray', keys: Object.keys(data)}];

    // 카테고리에 없는 키는 기타로
    const allCatKeys = categories.flatMap(c=>c.keys);
    const extraKeys  = Object.keys(data).filter(k=>!allCatKeys.includes(k));
    const allCats    = extraKeys.length
      ? [...categories, {title:'기타', badge:'badge-gray', keys:extraKeys}]
      : categories;

    const sectionsHtml = allCats.map(cat => {
      const catKeys = cat.keys.filter(k => k in data);
      if (!catKeys.length) return '';

      const fields = catKeys.map(key => {
        const val  = data[key] || '';
        const res  = resolved[key] || {};
        const isRef      = res.has_unresolved || res.has_cmd;
        const resolvedVal = res.resolved || '';
        const desc = VAR_DESC[key] || '';

        const label = `<label class="form-label">${key}${desc
          ? `<span class="tip-wrap"><i class="tip-icon">?</i>
              <span class="tip-box">${escHtml(desc)}</span></span>` : ''
        }</label>`;

        const hint = isRef
          ? `<div class="var-ref-hint">
              ${res.has_cmd
                ? '<span class="ref-badge ref-cmd">명령 치환 — 실행 시 자동 결정</span>'
                : '<span class="ref-badge ref-var">미해결 변수 참조</span>'}
              ${resolvedVal && resolvedVal !== val
                ? `<span class="ref-preview">→ ${escHtml(resolvedVal)}</span>` : ''}
             </div>`
          : (resolvedVal && resolvedVal !== val
              ? `<div class="var-ref-hint"><span class="ref-preview">→ ${escHtml(resolvedVal)}</span></div>`
              : '');

        return `<div class="form-field">
          ${label}
          <input class="form-input ${isRef?'input-ref':''}" id="env-${key}"
                 value="${escHtml(val)}" oninput="markDirty()">
          ${hint}
        </div>`;
      }).join('');

      return `<div class="form-section">
        <div class="form-section-header">
          <span class="form-section-title">${cat.title}</span>
          <span class="badge ${cat.badge}">${catKeys.length}개</span>
        </div>
        <div class="form-grid">${fields}</div>
      </div>`;
    }).join('');

    document.getElementById('env-form').innerHTML = `
      <div class="card">
        ${sectionsHtml}
        <div class="form-actions">
          <button onclick="renderEnv('${name}','${title}')">초기화</button>
          <button class="primary" onclick="saveEnv('${name}')">저장</button>
        </div>
      </div>`;
  } catch(e) {
    document.getElementById('env-form').innerHTML =
      `<div class="card" style="color:var(--red)">오류: ${e.message}</div>`;
  }
}

async function saveEnv(name) {
  const data = {};
  document.querySelectorAll('[id^="env-"]').forEach(i=>{
    data[i.id.replace('env-','')] = i.value;
  });
  try {
    await api('PUT', `/api/env/${name}`, {data});
    clearDirty();
    document.getElementById('dirty-badge')?.classList.add('hidden');
    toast(name+'.env 저장됨','ok');
  } catch(e) { toast('저장 실패: '+e.message,'err'); }
}

// ── 인벤토리 ─────────────────────────────────────────────────────────
let _hosts = [];

async function renderInventory() {
  clearDirty(); _invDirty=false;
  document.getElementById('page-inventory').innerHTML = `
    <div class="page-header">
      <div><div class="page-title">인벤토리</div>
           <div class="page-desc">hosts.txt — 클러스터 노드 목록 편집</div></div>
      <span id="inv-dirty-badge" class="badge badge-amber hidden">미저장</span>
    </div>
    <div class="card">
      <div class="inv-actions">
        <button onclick="addHost()">+ 노드 추가</button>
        <div style="display:flex;gap:8px">
          <button onclick="renderInventory()">새로고침</button>
          <button class="amber" onclick="analyzeInventory()">env 자동 채우기</button>
          <button class="primary" onclick="saveInventory()">저장</button>
        </div>
      </div>
      <div class="inv-wrap">
        <table>
          <thead><tr>
            <th>FQDN</th><th>역할</th><th>IP</th><th>Gateway</th>
            <th>NIC</th><th>MAC</th><th>Nettype</th><th>VLAN</th>
            <th>Install Dev</th><th></th>
          </tr></thead>
          <tbody id="inv-tbody">로딩 중...</tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:0">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>PXE / GRUB 파일 상태</span>
        <button class="small" onclick="renderInventory()">새로고침</button>
      </div>
      <div id="pxe-status">로딩 중...</div>
    </div>`;
  try {
    const {hosts} = await api('GET','/api/inventory');
    _hosts=hosts; renderInvRows();
  } catch(e) {
    document.getElementById('inv-tbody').innerHTML=
      `<tr><td colspan="10">오류: ${e.message}</td></tr>`;
  }

  try {
    const pxe = await api('GET', '/api/status/pxe');
    const pxeEl = document.getElementById('pxe-status');
    if (!pxeEl) return;
    if (pxe.total === 0) {
      pxeEl.innerHTML='<span style="color:var(--text3)">인벤토리 노드 없음</span>'; return;
    }
    const nodeRows = pxe.nodes.map(n =>
      '<tr><td style="font-family:monospace;font-size:11px">'+escHtml(n.fqdn)+'</td>'+
      '<td><span class="badge badge-gray">'+n.role+'</span></td>'+
      '<td style="font-family:monospace;font-size:11px">'+escHtml(n.mac||'-')+'</td>'+
      '<td><span class="badge '+(n.pxe?'badge-green':'badge-red')+'">'+(n.pxe?'✓':'없음')+'</span></td>'+
      '<td><span class="badge '+(n.grub?'badge-green':'badge-red')+'">'+(n.grub?'✓':'없음')+'</span></td></tr>'
    ).join('');
    pxeEl.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'+
        '<span class="badge '+(pxe.done===pxe.total?'badge-green':'badge-amber')+'">'+pxe.done+' / '+pxe.total+' 완료</span>'+
        '<span style="font-size:11px;color:var(--text3)">11-pxe-grub-render 실행 후 갱신</span></div>'+
      '<table style="width:100%"><thead><tr><th>FQDN</th><th>역할</th><th>MAC</th><th>PXE</th><th>GRUB</th></tr></thead>'+
      '<tbody>'+nodeRows+'</tbody></table>';
  } catch(e) {
    const pxeEl = document.getElementById('pxe-status');
    if (pxeEl) pxeEl.textContent = '오류: '+e.message;
  }
}

function renderInvRows() {
  const tbody=document.getElementById('inv-tbody');
  if (!tbody) return;
  tbody.innerHTML=_hosts.map((h,i)=>`<tr>
    <td><input value="${escHtml(h.fqdn)}"          onchange="updateHost(${i},'fqdn',this.value)"></td>
    <td><select onchange="updateHost(${i},'role',this.value)"
      style="font-size:12px;border:none;background:transparent;color:var(--text);width:100%">
      ${['bastion','bootstrap','master','worker','infra'].map(v=>
        `<option ${h.role===v?'selected':''}>${v}</option>`).join('')}
    </select></td>
    <td><input value="${escHtml(h.ip)}"            onchange="updateHost(${i},'ip',this.value)"></td>
    <td><input value="${escHtml(h.gateway||'')}"   onchange="updateHost(${i},'gateway',this.value)"></td>
    <td><input value="${escHtml(h.nic)}"           onchange="updateHost(${i},'nic',this.value)"></td>
    <td><input value="${escHtml(h.mac)}"           onchange="updateHost(${i},'mac',this.value)"></td>
    <td><select onchange="updateHost(${i},'nettype',this.value)"
                style="font-size:12px;border:none;background:transparent;color:var(--text)">
        ${['ethernet','vlan','bond'].map(v=>
          `<option ${h.nettype===v?'selected':''}>${v}</option>`).join('')}</select></td>
    <td><input value="${escHtml(h.vlan_id||'-')}"     onchange="updateHost(${i},'vlan_id',this.value)"></td>
    <td><input value="${escHtml(h.install_dev||'')}"  onchange="updateHost(${i},'install_dev',this.value)"></td>
    <td><button class="small danger" onclick="removeHost(${i})">삭제</button></td>
  </tr>`).join('');
}

function updateHost(i,k,v){
  _hosts[i][k]=v; _invDirty=true;
  document.getElementById('inv-dirty-badge')?.classList.remove('hidden');
}
function addHost(){
  _hosts.push({fqdn:'',role:'worker',ip:'',gateway:'',nic:'ens3',mac:'',nettype:'ethernet',vlan_id:'-',install_dev:''});
  renderInvRows();
}
function removeHost(i){ _hosts.splice(i,1); renderInvRows(); }

async function saveInventory(){
  try {
    await api('PUT','/api/inventory',{hosts:_hosts});
    _invDirty=false;
    document.getElementById('inv-dirty-badge')?.classList.add('hidden');
    toast('인벤토리 저장됨','ok');
  } catch(e){ toast('저장 실패: '+e.message,'err'); }
}

// ── 실행 ─────────────────────────────────────────────────────────────
let _es = null;

async function renderRun(mode) {
  const m = RUN_META[mode];
  let pf = null;
  try { pf = await api('GET','/api/preflight/'+mode); } catch(_) {}

  const groupsHtml = m.groups.map(g=>`
    <div class="step-group">
      <div class="step-group-title">
        <span class="badge ${g.badge}" style="font-size:10px">${g.title}</span>
      </div>
      <div class="step-list">
        ${g.steps.map(s=>`
          <div class="step-row" id="step-${s.id}">
            <div class="step-info">
              <span class="badge badge-gray" id="sb-${s.id}">대기</span>
              <div>
                <div class="step-name">${s.id}</div>
                <div class="step-desc">${escHtml(s.desc)}</div>
              </div>
            </div>
            <button class="small" onclick="runStep('${s.id}','${mode}')">실행</button>
          </div>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('page-run').innerHTML = `
    <div class="run-header">
      <div>
        <div class="run-title">${m.title}</div>
        <div class="page-desc">${m.desc}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button id="kill-btn" class="danger" style="display:none">실행 중단</button>
        <button class="primary" onclick="runAll('${mode}')">전체 실행</button>
      </div>
    </div>

    ${pf ? `<div class="card" style="margin-top:16px">
      <div class="card-title">실행 전 점검
        ${pf.ok
          ? '<span class="badge badge-green" style="margin-left:8px">모두 통과</span>'
          : '<span class="badge badge-red" style="margin-left:8px">문제 있음</span>'}
      </div>
      <div class="preflight-list">
        ${pf.checks.map(c=>`
          <div class="pf-row">
            <span class="pf-icon ${c.ok?'pf-ok':'pf-fail'}">${c.ok?'✓':'✗'}</span>
            <div class="pf-info">
              <div class="pf-name">${c.name}</div>
              <div class="pf-detail">${escHtml(c.detail)}</div>
            </div>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <div class="card" style="margin-top:16px">
      <div class="card-title">단계별 실행</div>
      ${groupsHtml}
    </div>

    ${mode==='install' ? `
    <div class="card" style="margin-top:0">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        <span>Bootstrap / 클러스터 상태</span>
        <button class="small" onclick="refreshBootstrap()">새로고침</button>
      </div>
      <div id="bootstrap-status">
        <span style="color:var(--text3);font-size:12px">새로고침으로 상태 확인</span>
      </div>
    </div>` : ''}
    <div class="card">
      <div class="log-header">
        <div class="card-title" style="margin:0">실행 로그</div>
        <button class="small" onclick="document.getElementById('log-${mode}').innerHTML=''">지우기</button>
      </div>
      <div class="log-box" id="log-${mode}"><span class="info">실행 버튼을 눌러 시작하세요.</span></div>
    </div>`;
}

async function runAll(mode){
  const box=document.getElementById('log-'+mode);
  box.innerHTML='';
  if(_es){_es.close();_es=null;}
  try {
    const {job_id}=await api('POST','/api/run/'+mode);
    appendLog(box,'[INFO] job '+job_id+' 시작');
    streamLog(job_id,box,null);
  } catch(e){ appendLog(box,'[ERROR] '+e.message); }
}

async function runStep(stepId,mode){
  const box=document.getElementById('log-'+mode);
  const badge=document.getElementById('sb-'+stepId);
  const row=document.getElementById('step-'+stepId);
  box.innerHTML='';
  if(_es){_es.close();_es=null;}
  setBadge(badge,row,'running');
  appendLog(box,'[INFO] '+stepId+' 실행 중...');
  try {
    const {job_id}=await api('POST','/api/run/step/'+stepId);
    streamLog(job_id,box,status=>{
      setBadge(badge,row,status);
      toast(stepId+': '+status, status==='success'?'ok':'err');
    });
  } catch(e){ setBadge(badge,row,'failed'); appendLog(box,'[ERROR] '+e.message); }
}

function streamLog(jobId,box,onDone){
  const es=new EventSource('/api/run/stream/'+jobId);
  _es=es;
  es.onmessage=e=>appendLog(box,e.data);
  es.addEventListener('done',e=>{
    const [s]=e.data.split(':');
    appendLog(box,'\n[DONE] '+s);
    if(onDone) onDone(s);
    es.close(); _es=null;
  });
  es.onerror=()=>{ appendLog(box,'[ERROR] 연결 끊김'); es.close(); _es=null; };
}

function setBadge(b,r,status){
  const m={running:['실행 중','badge-blue'],success:['완료','badge-green'],
           failed:['실패','badge-red'],pending:['대기','badge-gray']};
  const [t,c]=m[status]||['대기','badge-gray'];
  b.textContent=t; b.className='badge '+c;
  r.className='step-row '+(status==='pending'?'':status);
}

async function killJob(jobId) {
  if (!confirm('실행 중인 job을 강제 종료하시겠습니까?')) return;
  try {
    await api('DELETE', '/api/run/jobs/'+jobId+'/kill');
    toast('job 종료됨', 'ok');
    updateKillBtn(false);
    renderHistory();
  } catch(e) { toast('종료 실패: '+e.message, 'err'); }
}

// ── 실행 이력 ─────────────────────────────────────────────────────────
async function renderHistory(){
  document.getElementById('page-history').innerHTML=`
    <div class="page-header">
      <div><div class="page-title">실행 이력</div>
           <div class="page-desc">최근 50개 job 이력 (서버 재시작 후에도 유지)</div></div>
      <button onclick="renderHistory()">새로고침</button>
    </div>
    <div class="card" id="history-content">로딩 중...</div>`;
  try {
    const jobs=await api('GET','/api/run/jobs');
    const el=document.getElementById('history-content');
    if (!jobs.length){
      el.innerHTML='<div style="color:var(--text3);padding:8px">실행 이력 없음</div>';
      return;
    }
    const sorted=jobs.sort((a,b)=>(b.started_at||0)-(a.started_at||0));
    el.innerHTML=`<table style="width:100%">
      <thead><tr><th>Job ID</th><th>모드/단계</th><th>상태</th><th>시작시간</th><th>소요시간</th><th></th></tr></thead>
      <tbody>
        ${sorted.map(j=>{
          const dur=j.finished_at&&j.started_at?((j.finished_at-j.started_at)).toFixed(1)+'s':'-';
          const sc={success:'badge-green',failed:'badge-red',running:'badge-blue'}[j.status]||'badge-gray';
          return `<tr>
            <td style="font-family:monospace">${j.id}</td>
            <td>${j.mode}</td>
            <td><span class="badge ${sc}">${j.status}</span></td>
            <td>${fmtTime(j.started_at)}</td>
            <td>${dur}</td>
            <td style="display:flex;gap:6px">
              <button class="small" onclick="showJobLog('${j.id}')">로그</button>
              <button class="small danger" onclick="deleteJob('${j.id}')">삭제</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody></table>`;
  } catch(e){ document.getElementById('history-content').textContent='오류: '+e.message; }
}

async function showJobLog(jobId){
  try {
    const job=await api('GET','/api/run/jobs/'+jobId);
    const win=document.createElement('div');
    win.className='log-modal-wrap';
    win.innerHTML=`
      <div class="log-modal">
        <div class="log-modal-header">
          <span>Job ${job.id} — ${job.mode} (${job.status})</span>
          <button class="small" onclick="this.closest('.log-modal-wrap').remove()">닫기</button>
        </div>
        <div class="log-box" style="height:400px;border-radius:0">
          ${job.logs.map(l=>`<span class="${logClass(l)}">${escHtml(l)}\n</span>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(win);
    win.querySelector('.log-box').scrollTop=99999;
  } catch(e){ toast('로그 불러오기 실패: '+e.message,'err'); }
}

async function deleteJob(jobId){
  if (!confirm('이 이력을 삭제하시겠습니까?')) return;
  try {
    await api('DELETE','/api/run/jobs/'+jobId);
    renderHistory(); toast('삭제됨','ok');
  } catch(e){ toast('삭제 실패: '+e.message,'err'); }
}

async function refreshBootstrap() {
  const el = document.getElementById('bootstrap-status');
  if (!el) return;
  el.innerHTML = '<span style="color:var(--text3);font-size:12px">확인 중...</span>';
  try {
    const bs = await api('GET', '/api/status/bootstrap');
    const apiColor = bs.api_reachable ? 'badge-green' : 'badge-red';
    const ocColor  = bs.oc_available  ? 'badge-green' : 'badge-red';
    const nodeRows = bs.nodes.map(n =>
      '<tr><td style="font-family:monospace;font-size:11px">'+escHtml(n.name)+'</td>'+
      '<td><span class="badge '+(n.master?'badge-purple':'badge-gray')+'">'+(n.master?'master':'worker')+'</span></td>'+
      '<td style="font-size:11px">'+escHtml(n.status)+'</td>'+
      '<td><span class="badge '+(n.ready?'badge-green':'badge-amber')+'">'+(n.ready?'Ready':'NotReady')+'</span></td></tr>'
    ).join('');
    el.innerHTML =
      '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">'+
        '<span class="badge '+apiColor+'">API '+(bs.api_reachable?'응답':'미응답')+'</span>'+
        '<span class="badge '+ocColor+'">oc '+(bs.oc_available?'로그인됨':'로그인 필요')+'</span>'+
        (bs.pending_csrs>0 ? '<span class="badge badge-amber">CSR 대기 '+bs.pending_csrs+'건</span>' :
         bs.oc_available   ? '<span class="badge badge-green">CSR 대기 없음</span>' : '')+
      '</div>'+
      (bs.nodes.length>0 ?
        '<table style="width:100%"><thead><tr><th>노드</th><th>역할</th><th>상태</th><th>Ready</th></tr></thead><tbody>'+nodeRows+'</tbody></table>' :
        (bs.oc_available ? '<div style="color:var(--text3);font-size:12px">노드 없음</div>' : ''));
  } catch(e) { el.textContent = '오류: '+e.message; }
}

// ── 인벤토리 분석 ─────────────────────────────────────────────────────
async function analyzeInventory(){
  let result;
  try { result=await api('GET','/api/inventory/analyze'); }
  catch(e){ toast('분석 실패: '+e.message,'err'); return; }

  const {suggestions,notes}=result;
  const envNames={cluster:'클러스터',network:'네트워크',install_config:'Install Config'};
  const total=Object.values(suggestions).reduce((s,v)=>s+Object.keys(v).length,0);
  if (!total){ toast('추론할 수 있는 값이 없습니다.','err'); return; }

  const modal=document.createElement('div');
  modal.className='log-modal-wrap';
  modal.id='analyze-modal';

  const suggestRows=Object.entries(suggestions).map(([envName,kvs])=>`
    <div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;
                  letter-spacing:0.07em;margin-bottom:8px">${envNames[envName]||envName}</div>
      ${Object.entries(kvs).map(([k,v])=>`
        <div class="analyze-row">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;flex:1">
            <input type="checkbox" class="analyze-cb" data-env="${envName}" data-key="${k}"
                   checked style="width:14px;height:14px;cursor:pointer;flex-shrink:0">
            <span class="analyze-key">${k}</span>
          </label>
          <span class="analyze-val">${escHtml(v)}</span>
        </div>`).join('')}
    </div>`).join('');

  modal.innerHTML=`
    <div class="log-modal" style="max-height:80vh;display:flex;flex-direction:column">
      <div class="log-modal-header">
        <span>인벤토리 분석 — env 자동 채우기</span>
        <button class="small" onclick="document.getElementById('analyze-modal').remove()">닫기</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:18px">
        <div style="font-size:12px;color:var(--text2);margin-bottom:16px;padding:10px 12px;
                    background:var(--blue-bg);border-radius:var(--radius);border-left:3px solid var(--blue)">
          체크된 항목을 선택해서 env 파일에 반영합니다. 기존 값은 덮어씁니다.
        </div>
        ${suggestRows}
        <div style="margin-top:14px;padding-top:12px;border-top:0.5px solid var(--border)">
          <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.06em">분석 노트</div>
          ${notes.map(n=>`<div class="analyze-note">${escHtml(n)}</div>`).join('')}
        </div>
      </div>
      <div style="padding:12px 18px;border-top:0.5px solid var(--border);
                  display:flex;justify-content:space-between;align-items:center;background:var(--bg3)">
        <div style="display:flex;gap:8px">
          <button class="small" onclick="toggleAllAnalyze(true)">전체 선택</button>
          <button class="small" onclick="toggleAllAnalyze(false)">전체 해제</button>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('analyze-modal').remove()">취소</button>
          <button class="primary" onclick="applyAnalyze()">선택 항목 적용</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function toggleAllAnalyze(checked){
  document.querySelectorAll('.analyze-cb').forEach(cb=>cb.checked=checked);
}

async function applyAnalyze(){
  const byEnv={};
  document.querySelectorAll('.analyze-cb:checked').forEach(cb=>{
    const env=cb.dataset.env, key=cb.dataset.key;
    const val=cb.closest('.analyze-row').querySelector('.analyze-val').textContent;
    if (!byEnv[env]) byEnv[env]={};
    byEnv[env][key]=val;
  });
  if (!Object.keys(byEnv).length){ toast('선택된 항목이 없습니다.','err'); return; }

  let saved=0, failed=0;
  for (const [envName,newKvs] of Object.entries(byEnv)){
    try {
      const current=await api('GET','/api/env/'+envName);
      await api('PUT','/api/env/'+envName,{data:Object.assign({},current,newKvs)});
      saved++;
    } catch(e){ failed++; }
  }
  document.getElementById('analyze-modal').remove();
  toast(failed===0 ? saved+'개 env 파일에 반영됨' : saved+'개 성공, '+failed+'개 실패',
        failed===0 ? 'ok' : 'err');
}


// ── 백업 파일 정리 모달 ───────────────────────────────────────────────

async function openCleanupModal() {
  // 스캔
  let bak;
  try {
    bak = await api('POST', '/api/cleanup/bak', {dry_run: true, keep: 0});
  } catch(e) { toast('스캔 실패: '+e.message, 'err'); return; }

  const modal = document.createElement('div');
  modal.className = 'log-modal-wrap';
  modal.id = 'cleanup-modal';

  // 원본 기준 그룹핑
  const groups = {};
  bak.to_delete.forEach(f => {
    if (!groups[f.orig]) groups[f.orig] = [];
    groups[f.orig].push(f);
  });

  const groupRows = Object.entries(groups).map(([orig, files]) => {
    const totalSize = files.reduce((s,f)=>s+f.size, 0);
    const mb = (totalSize/1048576).toFixed(2);
    return `<div style="margin-bottom:10px">
      <div class="analyze-row">
        <div style="flex:1">
          <div class="file-name">${escHtml(orig.split('/').pop())}</div>
          <div class="file-path">${escHtml(orig)}</div>
        </div>
        <span class="badge badge-amber">${files.length}개 / ${mb} MB</span>
      </div>
      <div style="padding:4px 10px 0">
        ${files.sort((a,b)=>b.ts.localeCompare(a.ts)).map((f,i) => {
          const ts = f.ts;
          const fmt = ts.slice(0,4)+'-'+ts.slice(4,6)+'-'+ts.slice(6,8)+' '+
                      ts.slice(8,10)+':'+ts.slice(10,12)+':'+ts.slice(12,14);
          return `<div style="font-size:11px;font-family:monospace;color:var(--text3);
                              padding:2px 0;display:flex;justify-content:space-between">
            <span>${escHtml(f.path.split('/').pop())}</span>
            <span>${fmt}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  const mb_total = (bak.total_size/1048576).toFixed(1);

  modal.innerHTML = `
    <div class="log-modal" style="max-height:80vh;display:flex;flex-direction:column">
      <div class="log-modal-header">
        <span>백업 파일 정리 — ${bak.total_count}개 / ${mb_total} MB</span>
        <button class="small" onclick="document.getElementById('cleanup-modal').remove()">닫기</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px">
        ${bak.total_count === 0
          ? '<div style="color:var(--text3);padding:8px">정리할 백업 파일이 없습니다.</div>'
          : `<div style="font-size:12px;color:var(--text2);margin-bottom:14px;padding:10px 12px;
                         background:var(--amber-bg);border-radius:var(--radius);
                         border-left:3px solid var(--amber)">
               아래 파일들이 삭제됩니다. 삭제 후 복구 불가합니다.
             </div>
             ${groupRows}`}
      </div>
      <div style="padding:12px 16px;border-top:0.5px solid var(--border);
                  display:flex;justify-content:space-between;align-items:center;
                  background:var(--bg3)">
        <div style="display:flex;align-items:center;gap:10px">
          <label style="font-size:12px;display:flex;align-items:center;gap:6px">
            <span style="color:var(--text2)">최신</span>
            <input type="number" id="cleanup-keep" value="0" min="0" max="10"
                   style="width:50px;padding:4px 8px;border:0.5px solid var(--border2);
                          border-radius:6px;font-size:12px">
            <span style="color:var(--text2)">개 유지</span>
          </label>
          <span style="font-size:11px;color:var(--text3)">(0 = 전부 삭제)</span>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('cleanup-modal').remove()">취소</button>
          <button class="danger" onclick="doCleanup()" ${bak.total_count===0?'disabled':''}>
            ${bak.total_count}개 삭제
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
}

async function doCleanup() {
  const keep = parseInt(document.getElementById('cleanup-keep')?.value || '0');
  try {
    const result = await api('POST', '/api/cleanup/bak', {dry_run: false, keep});
    document.getElementById('cleanup-modal')?.remove();
    const errMsg = result.errors.length ? ` (오류 ${result.errors.length}건)` : '';
    toast(`${result.deleted.length}개 삭제 완료${errMsg}`, result.errors.length ? 'err' : 'ok');
    // 대시보드 새로고침
    renderStatus();
  } catch(e) { toast('삭제 실패: '+e.message, 'err'); }
}

// ── 초기화 ────────────────────────────────────────────────────────────
document.body.insertAdjacentHTML('beforeend','<div id="toast"></div>');
document.querySelectorAll('.nav-item').forEach(el=>
  el.addEventListener('click',()=>navigate(el.dataset.page)));
window.addEventListener('beforeunload',e=>{
  if (_dirty||_invDirty){ e.preventDefault(); e.returnValue=''; }
});
_navigate('status');
