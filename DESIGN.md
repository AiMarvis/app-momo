# Momo Design System

## Purpose

Momo builds on Kuku's compact Markdown workspace. Product surfaces should feel like a quiet desktop tool: dense, readable, local-first, and close to the existing editor/navigation chrome.

## Tokens

Source of truth: `apps/desktop/src/index.css`.

- Surfaces: `bg-bg-primary`, `bg-bg-secondary`, `bg-bg-tertiary`, `bg-bg-elevated`
- Borders: `border-border`, `border-border-variant`, `border-border-focused`
- Text: `text-text-primary`, `text-text-secondary`, `text-text-muted`, `text-text-disabled`
- Status: `text-warning`, `bg-warning-bg`, `border-warning-border`, `text-success`, `bg-success-bg`, `border-success-border`, `text-error`, `bg-error-bg`, `border-error-border`
- Radius: `rounded-xs` for panels, cards, buttons, and inputs
- Shadows: only existing popover/context shadows; product dashboard cards stay border-only

## Components

- Panels use `border border-border bg-bg-secondary/70` or `bg-bg-primary`.
- Cards use `rounded-xs border border-border bg-bg-primary p-3`.
- Buttons use existing border/ghost hover treatment and visible text labels.
- Collapsed details are preferred for low-level paths or technical metadata.

## Content

- Lead with user outcomes, not file paths or diffs.
- Keep provider and diagnostic language short and non-technical.
- Do not show raw prompts, raw provider output, credentials, auth headers, vault paths, or private note content.

## Accessibility

- Use semantic buttons, sections, headings, lists, and `details/summary`.
- Keep focus outlines from existing controls intact.
- Text must wrap without overlapping inside the right panel.
