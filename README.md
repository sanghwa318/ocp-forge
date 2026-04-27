# ocp-forge

OpenShift UPI 설치 자동화 Web UI — [ocp-tools](https://github.com/sanghwa318/ocp-tools) 연동

## 개요

OCP/OKD Bare-metal UPI 설치를 위한 웹 기반 인스톨러 UI입니다.  
Python 3.6 표준 라이브러리만 사용하므로 **추가 패키지 설치가 필요 없습니다.**

## 주요 기능

- **대시보드** — 서비스 상태, 필수 파일, COS 파일, ISO 마운트, 인증서 상태 한눈에 확인
- **설정 편집** — env 파일 카테고리별 편집 + 변수 치환 미리보기 (`${VAR}` → 실제값)
- **인벤토리** — hosts.txt 테이블 편집 + env 자동 채우기 (IP 기반 추론)
- **단계별 실행** — pre/install/post 전체 또는 개별 스텝 실행 + 실시간 로그 스트리밍
- **Preflight Check** — 실행 전 필수 조건 자동 점검
- **실행 이력** — job_history.json 영속 저장, 서버 재시작 후에도 유지
- **인증서 상태** — CN/SAN/만료일 표시, hosts.txt 불일치 경고, 레지스트리 컨테이너 인증서 비교

## 요구사항

- Rocky Linux 8 / RHEL 8 (`/usr/libexec/platform-python` 3.6 내장)
- [ocp-tools](https://github.com/sanghwa318/ocp-tools) 레포의 `install/` 디렉토리
- `openssl` 명령어 (인증서 상태 확인용)

## 설치 및 실행

```bash
# 1. ocp-tools 옆에 배치
cd /root
git clone https://github.com/sanghwa318/ocp-forge.git

# 2. 서버 실행
INSTALL_DIR=/root/ocp-tools/install bash ocp-forge/backend/start.sh
```

## 접속

```bash
# bastion 직접
http://<bastion-ip>:8081

# 포트포워딩 (외부 PC에서)
ssh -L 8081:localhost:8081 root@<bastion-ip>
# 브라우저: http://localhost:8081
```

## 디렉토리 구조

```
ocp-forge/
├── backend/
│   ├── server.py       # HTTP 서버 (표준 라이브러리만 사용)
│   ├── start.sh        # 실행 스크립트
│   └── static/
│       ├── index.html
│       ├── app.js
│       └── style.css
└── README.md
```

## ocp-tools 연동 구조

```
/root/
├── ocp-tools/
│   └── install/          ← INSTALL_DIR
│       ├── 00-vars/      ← env 파일 편집
│       ├── 00-inventory/ ← hosts.txt 편집
│       ├── 01-pre/
│       ├── 02-install/
│       ├── 03-post/
│       └── run.sh
└── ocp-forge/
    └── backend/          ← UI 서버
```

## 설치 플로우

```
hosts.txt 작성 → env 자동 채우기 → 각 env 파일 검토/수정
→ Pre 실행 (DNS/HAProxy/DHCP/PXE/Registry)
→ 노드 PXE 부팅 (bootstrap → master → worker)
→ Install 실행 (ignition 생성 → 배포)
→ 클러스터 완료 대기
→ Post 실행 (사용자/Ingress/Operator)
```

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/health` | 서버 상태 확인 |
| GET/PUT | `/api/env/{name}` | env 파일 읽기/저장 |
| GET | `/api/env/{name}/resolved` | 변수 치환 결과 |
| GET/PUT | `/api/inventory` | hosts.txt 읽기/저장 |
| GET | `/api/inventory/analyze` | 인벤토리 분석 → env 추론 |
| GET | `/api/status` | 서비스 상태 |
| GET | `/api/status/cert` | 인증서 상태 |
| GET | `/api/preflight/{mode}` | 실행 전 점검 |
| POST | `/api/run/{mode}` | pre/install/post 실행 |
| POST | `/api/run/step/{step}` | 개별 스텝 실행 |
| GET | `/api/run/stream/{job_id}` | 로그 SSE 스트리밍 |
