# Forge AI

독립 실행형 로컬 AI 채팅 데스크톱 앱입니다. 기존 프로젝트, 서버, 데이터베이스에 의존하지 않으며 Ollama의 로컬 GPU 런타임으로 Ornith GGUF 모델을 사용합니다.

대화 기록은 앱의 로컬 저장소와 Electron 사용자 데이터 파일(`local-ai-state.json`)에 자동 저장되어 창을 닫았다 다시 열어도 유지됩니다.

## 실행

```powershell
npm install
npm run dev -- --host 127.0.0.1 --port 5174
```

브라우저에서 `http://127.0.0.1:5174/`를 엽니다.

## Windows 데스크톱 앱 실행

개발용 데스크톱 창으로 실행합니다.

```powershell
npm run desktop
```

Windows 설치 파일(`.exe`)을 생성합니다.

```powershell
npm run desktop:package
```

생성된 설치 파일은 `outputs/release/` 폴더에 있습니다. 설치 후에는 브라우저 없이 `Forge AI` 앱을 시작 메뉴 또는 바탕화면 바로가기에서 실행할 수 있습니다. 현재 빌드 버전은 `0.1.8`입니다.

## Ornith 로컬 런타임

Ornith GGUF가 Ollama에 `Ornith:latest`로 등록되어 있으면 앱이 실행될 때 Ollama 서버를 자동으로 시작합니다. Ollama가 GPU를 지원하는 환경에서는 모델 로딩 시 GPU 오프로딩을 사용합니다.

```powershell
ollama create Ornith -f Ornith.Modelfile
```

앱의 `Settings`에서 endpoint를 바꿀 수 있고, `Test connection`을 누르면 Ollama `/api/tags` 목록을 불러옵니다.

## 포함된 기능

- Ornith `/api/tags` 기반 모델 탐색
- Ornith `/api/chat` 기반 로컬 대화
- `Auto` 라우팅: 간단한 요청은 `qwen3.5:9b`, 분석·설계·디버깅·긴 요청은 `Ornith:latest`
- 다중 모델 이미지 파이프라인: `qwen2.5vl:3b`가 이미지의 글·그림·레이아웃을 추출하고, 웹/Graft 자료를 수집한 뒤 Ornith가 종합 추론하며 `qwen3.5:9b`가 최종 답변을 검증
- 설치본 인플레이스 업데이트: Settings에서 `outputs/release`를 업데이트 feed로 확인하고 새 NSIS 버전을 앱 종료·재설치 없이 기존 경로에 자동 업그레이드
- GitHub Releases 업데이트: 설치본이 `ghmhjy/ai-workspace`를 확인하고 새 Release를 알림·다운로드·재시작 설치
- `Fast` / `Precision` 수동 모델 모드
- 대화 생성 및 최근 대화 선택
- 웹 검색 토글, 자동 모델 라우팅, temperature/context 조절
- endpoint 저장 및 연결 테스트
- 선택형 웹 검색: composer의 지구본 버튼을 켜면 Electron이 DuckDuckGo 공개 검색 페이지에서 최대 5개 결과를 찾고 상위 페이지 본문을 읽어 로컬 모델에 참고자료로 전달
- 답변 출처 링크: 답변 아래 출처를 누르면 앱의 별도 웹 뷰어 창에서 실제 사이트를 열람
- Graft 프로젝트 컨텍스트: Settings에서 사용자가 선택한 저장소를 인덱싱하고, composer의 코드 버튼으로 관련 파일·라인 컨텍스트를 로컬 모델에 전달
- 실시간 기기 컨텍스트: 질문을 보낼 때 현재 날짜·시각·시간대 자동 전달, 위치는 사용자가 입력한 선택적 위치 힌트 또는 시간대 기반 근사값 사용
- 연결 불가 시 명확한 오프라인 안내
- Ollama와 유사한 반응형 데스크톱 레이아웃 및 모바일 축소 레이아웃
- Electron 기반 독립 Windows 창 및 NSIS 설치 패키지

웹 검색은 별도 검색 API 키나 유료 AI API를 사용하지 않으므로 이 앱에서 추가 요금이 발생하지 않습니다. 다만 검색어와 검색 결과 요청은 인터넷을 통해 DuckDuckGo로 전송되고, 인터넷 연결 및 공개 검색 서비스의 rate limit에 영향을 받습니다. 검색을 끄면 질문과 답변은 Ollama를 통해 전부 로컬에서 처리됩니다.

## GitHub release flow

`v0.1.3` 같은 semver tag를 GitHub에 push하면 `.github/workflows/release.yml`이 Windows x64 NSIS 설치 파일을 만들고 GitHub Release에 업로드합니다. 설치된 앱은 시작 후 GitHub Release를 확인하고, Settings의 `Check for updates`에서도 수동 확인할 수 있습니다. Release를 만들려면 먼저 `package.json`의 version을 올린 뒤 tag를 push해야 합니다.
