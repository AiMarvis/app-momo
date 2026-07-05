<div align="center">
  <h1 align="center">
    <img src="assets/logo/logo.svg" alt="Momo logo" width="42" align="center">
    Momo
  </h1>

  <p align="center">
    <strong>macOS를 위한 로컬 우선 지식 및 프로젝트 작업공간.</strong><br>
    Markdown 노트, AI Chat, Today Dashboard, Project OS, 검토 가능한 자동화.
  </p>

  <p align="center">
    <a href="https://github.com/AiMarvis/app-momo/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-f97316.svg" alt="License MIT"></a>&nbsp;
    <a href="https://github.com/AiMarvis/app-momo/releases"><img src="https://img.shields.io/github/v/release/AiMarvis/app-momo?label=release&color=2563eb" alt="Latest release"></a>&nbsp;
    <img src="https://img.shields.io/badge/platform-macOS-111827?logo=apple&logoColor=white" alt="macOS">&nbsp;
    <img src="https://img.shields.io/badge/built%20with-Tauri%20%2B%20SolidJS-24c8db" alt="Built with Tauri and SolidJS">
  </p>

  <p align="center">
    <a href="https://github.com/AiMarvis/app-momo/releases"><strong>Download</strong></a> ·
    <a href="docs/development_ko.md"><strong>개발 문서</strong></a> ·
    <a href="README.md"><strong>English</strong></a>
  </p>
</div>

## Momo란?

Momo는 노트, 프로젝트 결정, AI와 함께한 작업이 이동 가능하고 검토 가능한 상태로 남기를 원하는 사람들을 위한 오픈소스 macOS 앱입니다. 일반 Markdown 파일을 기반으로 검색, 그래프 탐색, AI Chat, Today Dashboard, Project OS를 더합니다.

Project OS는 사용자가 연결한 로컬 프로젝트 폴더를 읽고, 비개발자도 이해할 수 있는 작업 단위로 정리합니다. agent는 연결된 폴더만 읽고 구조화된 plan을 반환하며, 앱은 검증을 통과한 Project OS 이슈만 반영합니다.

## 왜 만들었나요?

- **파일은 사용자에게 남아야 합니다**: 노트는 숨겨진 플랫폼 데이터가 아니라 일반 Markdown 파일입니다.
- **AI는 검토 가능해야 합니다**: AI는 요약, 분석, 작업 제안을 돕지만 앱 상태 변경은 구조화된 검증을 거칩니다.
- **프로젝트에는 쉬운 다음 행동이 필요합니다**: Project OS 이슈는 무엇을 해야 하는지, 왜 필요한지, 완료 후 무엇이 좋아지는지, 다음 행동이 무엇인지 보여줍니다.
- **로컬 맥락은 경계가 분명해야 합니다**: 프로젝트 분석은 사용자가 직접 연결한 폴더 안으로 제한됩니다.
- **배포는 투명해야 합니다**: 앱 소스, 릴리스 스크립트, 데스크톱 설정을 공개된 repo에서 확인할 수 있습니다.

## 주요 기능

- **로컬 Markdown 지식보관함**: git, 에디터, 다른 Markdown 도구와 함께 쓸 수 있는 파일에 그대로 씁니다.
- **Today Dashboard**: 오늘 할 일, 프로젝트, 날짜, 이슈, 아이디어를 한 화면에서 봅니다.
- **Project OS**: 프로젝트를 만들고, 로컬 폴더를 연결하고, 수동 분석으로 명확한 프로젝트 작업을 생성합니다.
- **AI Chat과 워크플로**: 질문하고, 맥락을 첨부하고, 생성된 변경을 검토 가능한 흐름으로 다룹니다.
- **검색과 그래프 탐색**: 로컬 작업공간의 노트, 링크, 관계를 찾고 탐색합니다.
- **선택적 동기화 기반**: 관리형 또는 셀프 호스팅 경로를 원하는 사용자를 위해 암호화 동기화 코드가 포함되어 있습니다.

## 설치

공개 macOS 빌드는 GitHub Releases를 통해 배포할 예정입니다.

- **GitHub Releases**: 준비되면 [Releases](https://github.com/AiMarvis/app-momo/releases)에서 서명 및 공증된 macOS DMG를 받을 수 있습니다.
- **Homebrew cask**: 첫 공개 서명 릴리스 이후 준비할 예정입니다.

플랫폼 상태:

- macOS: 지원
- Windows: 아직 미지원
- Linux: 아직 미지원

## 개발

개발 참고 문서는 [docs/development_ko.md](docs/development_ko.md)에 있습니다. 이 repo에는 macOS 데스크톱 앱, 웹 에셋, 서버 코드, 공유 계약, Rust crate, 프로젝트에서 사용하는 Docker 인프라가 포함되어 있습니다.

## 기여

버그 리포트, 기능 제안, 문서 개선, PR 모두 환영합니다. 큰 변경을 시작하기 전에는 먼저 이슈를 열어 방향을 분명히 맞춰 주세요.

## 라이선스

[MIT](LICENSE) © Momo
