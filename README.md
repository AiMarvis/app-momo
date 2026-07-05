<div align="center">
  <h1 align="center">
    <img src="assets/logo/logo.svg" alt="Momo logo" width="42" align="center">
    Momo
  </h1>

  <p align="center">
    <strong>A local-first knowledge and project workspace for macOS.</strong><br>
    Markdown notes, AI chat, Today Dashboard, Project OS, and reviewable automation.
  </p>

  <p align="center">
    <a href="https://github.com/AiMarvis/app-momo/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-f97316.svg" alt="License MIT"></a>&nbsp;
    <a href="https://github.com/AiMarvis/app-momo/releases"><img src="https://img.shields.io/github/v/release/AiMarvis/app-momo?label=release&color=2563eb" alt="Latest release"></a>&nbsp;
    <img src="https://img.shields.io/badge/platform-macOS-111827?logo=apple&logoColor=white" alt="macOS">&nbsp;
    <img src="https://img.shields.io/badge/built%20with-Tauri%20%2B%20SolidJS-24c8db" alt="Built with Tauri and SolidJS">
  </p>

  <p align="center">
    <a href="https://github.com/AiMarvis/app-momo/releases"><strong>Download</strong></a> ·
    <a href="docs/development.md"><strong>Development</strong></a> ·
    <a href="README_ko.md"><strong>한국어</strong></a>
  </p>
</div>

## What Is Momo?

Momo is an open-source macOS app for people who want their notes, project decisions, and AI-assisted work to stay portable and reviewable. It works with ordinary Markdown files and adds a focused workspace for search, graph navigation, AI chat, Today Dashboard, and Project OS.

Project OS helps turn a linked project folder into clear, non-technical tasks. The agent reads only the folder you connect, returns a structured plan, and the app applies only validated Project OS issues.

## Why It Exists

- **Your files should stay yours**: notes remain plain Markdown, not hidden platform data.
- **AI should be reviewable**: AI can help summarize, analyze, and propose work, but app state changes go through structured validation.
- **Projects need plain-language next steps**: Project OS issues describe what to do, why it matters, what improves for users, and the next action.
- **Local context should stay bounded**: project analysis is limited to the folder you explicitly link.
- **Distribution should be transparent**: the app source, release scripts, and desktop configuration live in the open.

## Highlights

- **Local Markdown vault**: keep notes in files that work with git, editors, and other Markdown tools.
- **Today Dashboard**: collect daily work, projects, dates, issues, and ideas in one surface.
- **Project OS**: create projects, link local folders, analyze them manually, and generate clear project tasks.
- **AI chat and workflows**: ask questions, attach context, and keep generated changes reviewable.
- **Search and graph navigation**: find notes, links, and relationships across your local workspace.
- **Optional sync foundation**: encrypted sync code is included for users who want a managed or self-hosted path later.

## Install

The public macOS build will be distributed through GitHub Releases.

- **GitHub Releases**: download the latest signed and notarized macOS DMG from [Releases](https://github.com/AiMarvis/app-momo/releases) when available.
- **Homebrew cask**: planned after the first public signed release.

Platform status:

- macOS: supported
- Windows: not supported yet
- Linux: not supported yet

## Development

Development notes live in [docs/development.md](docs/development.md). The repository includes the macOS desktop app, web assets, server code, shared contracts, Rust crates, and Docker infrastructure used by the project.

## Contributing

Bug reports, feature ideas, documentation improvements, and pull requests are welcome. For larger changes, open an issue first so the direction is clear.

## License

[MIT](LICENSE) © Momo
