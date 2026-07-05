import { FontInput } from "~/components/settings/font_input";
import {
  SettingsFieldRow,
  SettingsPanel,
  SettingsSelect,
} from "~/components/settings/settings_blocks";
import { t } from "~/i18n";
import { Switch } from "~/components/ui";
import { setEditorSetting, setGeneralSetting, settingsState } from "~/stores/settings";

const TAB_SIZE_OPTIONS = [
  { value: "2", label: "2" },
  { value: "4", label: "4" },
  { value: "8", label: "8" },
];

const FONT_SIZE_OPTIONS = [
  { value: "12", label: "12 px" },
  { value: "13", label: "13 px" },
  { value: "14", label: "14 px" },
  { value: "15", label: "15 px" },
  { value: "16", label: "16 px" },
  { value: "17", label: "17 px" },
  { value: "18", label: "18 px" },
  { value: "19", label: "19 px" },
  { value: "20", label: "20 px" },
  { value: "21", label: "21 px" },
  { value: "22", label: "22 px" },
  { value: "23", label: "23 px" },
  { value: "24", label: "24 px" },
  { value: "25", label: "25 px" },
  { value: "26", label: "26 px" },
  { value: "27", label: "27 px" },
  { value: "28", label: "28 px" },
  { value: "29", label: "29 px" },
  { value: "30", label: "30 px" },
  { value: "31", label: "31 px" },
  { value: "32", label: "32 px" },
];

const LINE_HEIGHT_OPTIONS = [
  { value: "1.4", label: "1.4" },
  { value: "1.5", label: "1.5" },
  { value: "1.6", label: "1.6" },
  { value: "1.7", label: "1.7" },
  { value: "1.8", label: "1.8" },
  { value: "2", label: "2.0" },
];

function EditorSection() {
  return (
    <SettingsPanel
      title={t("settings.editor.title")}
      description={t("settings.editor.description")}
      anchor="editor"
    >
      <SettingsFieldRow
        label={t("settings.editor.auto_save.label")}
        description={t("settings.editor.auto_save.description")}
        control={
          <Switch
            checked={settingsState.general.autoSave}
            onChange={(value) => setGeneralSetting("autoSave", value)}
          />
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.typing_indicator.label")}
        description={t("settings.editor.typing_indicator.description")}
        control={
          <Switch
            checked={settingsState.general.typingIndicator}
            onChange={(value) => setGeneralSetting("typingIndicator", value)}
          />
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.spell_check.label")}
        description={t("settings.editor.spell_check.description")}
        control={
          <Switch
            checked={settingsState.general.spellCheck}
            onChange={(value) => setGeneralSetting("spellCheck", value)}
          />
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.tab_size.label")}
        description={t("settings.editor.tab_size.description")}
        control={
          <div class="w-full max-w-40">
            <SettingsSelect
              options={TAB_SIZE_OPTIONS}
              value={String(settingsState.editor.tabSize)}
              onChange={(value) => setEditorSetting("tabSize", Number.parseInt(value, 10))}
              placeholder={t("settings.editor.tab_size.placeholder")}
            />
          </div>
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.font_size.label")}
        description={t("settings.editor.font_size.description")}
        control={
          <div class="w-full max-w-40">
            <SettingsSelect
              options={FONT_SIZE_OPTIONS}
              value={String(settingsState.editor.fontSize)}
              onChange={(value) => setEditorSetting("fontSize", Number.parseInt(value, 10))}
              placeholder={t("settings.editor.font_size.placeholder")}
            />
          </div>
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.line_height.label")}
        description={t("settings.editor.line_height.description")}
        control={
          <div class="w-full max-w-40">
            <SettingsSelect
              options={LINE_HEIGHT_OPTIONS}
              value={String(settingsState.editor.lineHeight)}
              onChange={(value) => setEditorSetting("lineHeight", Number.parseFloat(value))}
              placeholder={t("settings.editor.line_height.placeholder")}
            />
          </div>
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.font.label")}
        description={t("settings.editor.font.description")}
        control={
          <div class="w-full max-w-70">
            <FontInput
              value={settingsState.editor.fontFamily}
              placeholder={t("settings.editor.font.placeholder")}
              onCommit={(value) => setEditorSetting("fontFamily", value)}
            />
          </div>
        }
      />
      <SettingsFieldRow
        label={t("settings.editor.font_mono.label")}
        description={t("settings.editor.font_mono.description")}
        control={
          <div class="w-full max-w-70">
            <FontInput
              value={settingsState.editor.fontMono}
              placeholder={t("settings.editor.font_mono.placeholder")}
              onCommit={(value) => setEditorSetting("fontMono", value)}
            />
          </div>
        }
      />
    </SettingsPanel>
  );
}

export { EditorSection };
