use crate::{secure_storage, variant};

pub fn plugin_secret_service() -> String {
    variant::keychain_service("plugin-secrets")
}

#[derive(Debug)]
pub enum PluginSecretError {
    InvalidPluginId,
    InvalidFieldName,
    State(String),
    Store(String),
    NotFound,
}

impl std::fmt::Display for PluginSecretError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PluginSecretError::InvalidPluginId => write!(f, "invalid plugin id"),
            PluginSecretError::InvalidFieldName => write!(f, "invalid secret field name"),
            PluginSecretError::State(message) => write!(f, "{message}"),
            PluginSecretError::Store(message) => write!(f, "{message}"),
            PluginSecretError::NotFound => write!(f, "plugin secret not found"),
        }
    }
}

impl std::error::Error for PluginSecretError {}

impl From<secure_storage::SecureStorageError> for PluginSecretError {
    fn from(value: secure_storage::SecureStorageError) -> Self {
        match value {
            #[cfg(debug_assertions)]
            secure_storage::SecureStorageError::State(message) => Self::State(message),
            secure_storage::SecureStorageError::Store(message) => Self::Store(message),
            secure_storage::SecureStorageError::NotFound => Self::NotFound,
        }
    }
}

pub fn read_plugin_secret(
    plugin_id: &str,
    field_name: &str,
) -> Result<Option<String>, PluginSecretError> {
    let account = secret_account(plugin_id, field_name)?;
    let bytes = secure_storage::read_bytes(&plugin_secret_service(), &account)?;
    match bytes {
        Some(bytes) => String::from_utf8(bytes).map(Some).map_err(|error| {
            PluginSecretError::Store(format!("invalid utf-8 plugin secret: {error}"))
        }),
        None => Ok(None),
    }
}

pub fn write_plugin_secret(
    plugin_id: &str,
    field_name: &str,
    value: &str,
) -> Result<(), PluginSecretError> {
    let account = secret_account(plugin_id, field_name)?;
    secure_storage::write_bytes(&plugin_secret_service(), &account, value.as_bytes())?;
    Ok(())
}

pub fn delete_plugin_secret(plugin_id: &str, field_name: &str) -> Result<(), PluginSecretError> {
    let account = secret_account(plugin_id, field_name)?;
    secure_storage::delete(&plugin_secret_service(), &account)?;
    Ok(())
}

pub fn has_plugin_secret(plugin_id: &str, field_name: &str) -> Result<bool, PluginSecretError> {
    Ok(read_plugin_secret(plugin_id, field_name)?.is_some())
}

pub fn secret_account(plugin_id: &str, field_name: &str) -> Result<String, PluginSecretError> {
    validate_plugin_id(plugin_id)?;
    validate_field_name(field_name)?;
    Ok(format!("{plugin_id}:{field_name}"))
}

pub fn validate_plugin_id(plugin_id: &str) -> Result<(), PluginSecretError> {
    if is_valid_identifier(plugin_id) {
        return Ok(());
    }
    Err(PluginSecretError::InvalidPluginId)
}

pub fn validate_field_name(field_name: &str) -> Result<(), PluginSecretError> {
    if field_name == "__secure" {
        return Err(PluginSecretError::InvalidFieldName);
    }
    if is_valid_identifier(field_name) {
        return Ok(());
    }
    Err(PluginSecretError::InvalidFieldName)
}

fn is_valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_plugin_id_accepts_supported_identifier_characters() {
        assert!(validate_plugin_id("ai-chat").is_ok());
        assert!(validate_plugin_id("core_indexer").is_ok());
        assert!(validate_plugin_id("github.v2").is_ok());
    }

    #[test]
    fn validate_plugin_id_rejects_empty_or_unsafe_values() {
        assert!(validate_plugin_id("").is_err());
        assert!(validate_plugin_id("../evil").is_err());
        assert!(validate_plugin_id("a/b").is_err());
        assert!(validate_plugin_id("a\\b").is_err());
        assert!(validate_plugin_id("a:b").is_err());
        assert!(validate_plugin_id("space value").is_err());
    }

    #[test]
    fn validate_field_name_rejects_reserved_or_unsafe_values() {
        assert!(validate_field_name("apiKey").is_ok());
        assert!(validate_field_name("bot_token").is_ok());
        assert!(validate_field_name("__secure").is_err());
        assert!(validate_field_name("").is_err());
        assert!(validate_field_name("api/key").is_err());
        assert!(validate_field_name("api:key").is_err());
        assert!(validate_field_name("api key").is_err());
    }

    #[test]
    fn secret_account_uses_plugin_and_field_name_pairing() {
        assert_eq!(
            secret_account("ai-chat", "apiKey").unwrap(),
            "ai-chat:apiKey"
        );
    }
}
