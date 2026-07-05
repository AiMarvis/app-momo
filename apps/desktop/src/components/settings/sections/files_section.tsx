import { createSignal } from "solid-js";

import {
  SettingsFieldRow,
  SettingsPanel,
  SettingsSelect,
  SettingsToolbarAction,
} from "~/components/settings/settings_blocks";
import { t } from "~/i18n";
import { setFilesSetting, settingsState } from "~/stores/settings";
import { emptyTrashFolder, openTrashFolder, vaultState } from "~/stores/vault";

function FilesSection() {
  const [confirmEmptyTrash, setConfirmEmptyTrash] = createSignal(false);
  const newFileLocationOptions = [
    { value: "root", label: t("settings.files.location.root") },
    { value: "current", label: t("settings.files.location.current") },
  ];
  const deletedFilesOptions = [
    { value: "trash", label: t("settings.files.deleted.trash") },
    { value: "kuku-trash", label: t("settings.files.deleted.kuku_trash") },
    { value: "permanent", label: t("settings.files.deleted.permanent") },
  ];

  return (
    <SettingsPanel
      title={t("settings.files.title")}
      description={t("settings.files.description")}
      anchor="files"
    >
      <SettingsFieldRow
        label={t("settings.files.location.label")}
        description={t("settings.files.location.description")}
        control={
          <div class="w-full max-w-64">
            <SettingsSelect
              options={newFileLocationOptions}
              value={settingsState.files.newFileLocation}
              onChange={(value) => setFilesSetting("newFileLocation", value)}
              placeholder={t("settings.files.location.placeholder")}
            />
          </div>
        }
      />
      <SettingsFieldRow
        label={t("settings.files.deleted.label")}
        description={t("settings.files.deleted.description")}
        control={
          <div class="w-full max-w-64">
            <SettingsSelect
              options={deletedFilesOptions}
              value={settingsState.files.deletedFiles}
              onChange={(value) => setFilesSetting("deletedFiles", value)}
              placeholder={t("settings.files.deleted.placeholder")}
            />
          </div>
        }
      />
      {settingsState.files.deletedFiles === "kuku-trash" ? (
        <SettingsFieldRow
          label={t("settings.files.kuku_trash.label")}
          description={
            confirmEmptyTrash()
              ? t("settings.files.kuku_trash.confirm_description")
              : t("settings.files.kuku_trash.description")
          }
          control={
            <div class="flex items-center gap-2">
              <SettingsToolbarAction
                disabled={!vaultState.rootPath}
                onClick={() => void openTrashFolder()}
              >
                {t("settings.files.kuku_trash.open")}
              </SettingsToolbarAction>
              {confirmEmptyTrash() ? (
                <>
                  <SettingsToolbarAction
                    disabled={!vaultState.rootPath}
                    variant="destructive"
                    onClick={() => {
                      setConfirmEmptyTrash(false);
                      void emptyTrashFolder();
                    }}
                  >
                    {t("settings.files.kuku_trash.confirm_empty")}
                  </SettingsToolbarAction>
                  <SettingsToolbarAction onClick={() => setConfirmEmptyTrash(false)}>
                    {t("settings.files.kuku_trash.cancel")}
                  </SettingsToolbarAction>
                </>
              ) : (
                <SettingsToolbarAction
                  disabled={!vaultState.rootPath}
                  variant="destructive"
                  onClick={() => setConfirmEmptyTrash(true)}
                >
                  {t("settings.files.kuku_trash.empty")}
                </SettingsToolbarAction>
              )}
            </div>
          }
        />
      ) : null}
    </SettingsPanel>
  );
}

export { FilesSection };
