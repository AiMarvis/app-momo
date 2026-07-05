#![allow(dead_code)]

use std::{fmt, future::Future, pin::Pin, sync::Arc};

use async_trait::async_trait;
use connectrpc::{ConnectError, ErrorCode, client::CallOptions};
use kuku_contract::buffa::EnumValue;
use kuku_contract::proto::kuku::sync::v1::SyncCommitKind;
use kuku_contract::proto::kuku::sync::v1::{
    CompleteObjectUploadBatchRequest, CompletedObjectUpload, CreateAccountKeyRequest,
    CreateObjectDownloadBatchRequest, CreateObjectUploadBatchRequest, CreateWorkspaceRequest,
    DeleteWorkspaceRequest, GetAccountKeyStateRequest, GetHeadRequest,
    ListAccountKeyEnvelopesRequest, ListCommitsRequest, ListKeyEnvelopesRequest,
    ListWorkspacesRequest, ObjectDownloadTarget, ObjectReservation, ObjectReservationRequest,
    ObjectUploadResult, PublishCommitRequest, PutAccountKeyEnvelopeRequest, PutKeyEnvelopeRequest,
    RegisterDeviceRequest, ReserveObjectIdsRequest, SyncAccountKey, SyncAccountKeyEnvelope,
    SyncAccountKeyRecipientType, SyncCommit, SyncDevice, SyncHttpHeader, SyncKeyEnvelope,
    SyncKeyRecipientType, SyncObject, SyncObjectErrorReason, SyncObjectKind, SyncWorkspace,
    UpdateDeviceMetadataRequest, UpdateWorkspaceKeyRequest, UpdateWorkspaceMetadataRequest,
    UploadObjectDescriptor,
};

use crate::contract_client;

use super::errors::{SyncError, SyncResult};

pub type RefreshAuthorizationHeader =
    Arc<dyn Fn() -> Pin<Box<dyn Future<Output = SyncResult<Option<String>>> + Send>> + Send + Sync>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectReservationInput {
    pub client_object_ref: String,
    pub kind: SyncObjectKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ReservedObject {
    pub client_object_ref: String,
    pub object_id: String,
    pub kind: SyncObjectKind,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectUploadDescriptor {
    pub object_id: String,
    pub kind: SyncObjectKind,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HttpHeader {
    pub name: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectUploadTargetDescriptor {
    pub object_id: String,
    pub put_url: String,
    pub required_headers: Vec<HttpHeader>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CompletedObjectUploadDescriptor {
    pub object_id: String,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
    pub provider_etag: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UploadedObjectMetadata {
    pub object_id: String,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectUploadCompletion {
    pub object: Option<UploadedObjectMetadata>,
    pub error_reason: Option<SyncObjectErrorReason>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ObjectDownloadTargetDescriptor {
    pub object_id: String,
    pub kind: SyncObjectKind,
    pub get_url: String,
    pub required_headers: Vec<HttpHeader>,
    pub ciphertext_sha256: String,
    pub size_bytes: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncWorkspaceMetadata {
    pub workspace_id: String,
    pub current_head_commit_id: String,
    pub head_version: i64,
    pub crypto_version: String,
    pub encrypted_metadata: Vec<u8>,
    pub metadata_version: i64,
    pub encrypted_workspace_key: Vec<u8>,
    pub workspace_key_version: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncDeviceMetadata {
    pub device_id: String,
    pub workspace_id: String,
    pub signing_public_key: Vec<u8>,
    pub encryption_public_key: Vec<u8>,
    pub encrypted_device_name: Vec<u8>,
    pub metadata_version: i64,
    pub last_device_seq: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncAccountKeyMetadata {
    pub account_key_id: String,
    pub crypto_version: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncAccountKeyEnvelopeMetadata {
    pub account_key_id: String,
    pub envelope_id: String,
    pub recipient_type: SyncAccountKeyRecipientType,
    pub key_version: i64,
    pub kdf_params_json: String,
    pub encrypted_envelope: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncKeyEnvelopeMetadata {
    pub workspace_id: String,
    pub envelope_id: String,
    pub recipient_type: SyncKeyRecipientType,
    pub recipient_device_id: String,
    pub key_version: i64,
    pub kdf_params_json: String,
    pub encrypted_envelope: Vec<u8>,
    pub created_by_device_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PutKeyEnvelopeInput {
    pub workspace_id: String,
    pub envelope_id: String,
    pub recipient_type: SyncKeyRecipientType,
    pub recipient_device_id: Option<String>,
    pub key_version: i64,
    pub kdf_params_json: String,
    pub encrypted_envelope: Vec<u8>,
    pub created_by_device_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreateAccountKeyInput {
    pub account_key_id: String,
    pub crypto_version: String,
    pub envelope_id: String,
    pub recipient_type: SyncAccountKeyRecipientType,
    pub key_version: i64,
    pub kdf_params_json: String,
    pub encrypted_envelope: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PutAccountKeyEnvelopeInput {
    pub envelope_id: String,
    pub recipient_type: SyncAccountKeyRecipientType,
    pub key_version: i64,
    pub kdf_params_json: String,
    pub encrypted_envelope: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpdateWorkspaceMetadataInput {
    pub workspace_id: String,
    pub encrypted_metadata: Vec<u8>,
    pub metadata_version: i64,
    pub expected_metadata_version: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpdateWorkspaceKeyInput {
    pub workspace_id: String,
    pub encrypted_workspace_key: Vec<u8>,
    pub workspace_key_version: i64,
    pub expected_workspace_key_version: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct UpdateDeviceMetadataInput {
    pub workspace_id: String,
    pub device_id: String,
    pub encrypted_device_name: Vec<u8>,
    pub metadata_version: i64,
    pub expected_metadata_version: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncHead {
    pub current_head_commit_id: String,
    pub head_version: i64,
    pub latest_checkpoint_commit_id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SyncCommitHeader {
    pub commit_id: String,
    pub commit_kind: SyncCommitKind,
    pub expected_head_commit_id: String,
    pub parent_commit_ids: Vec<String>,
    pub author_device_id: String,
    pub device_seq: i64,
    pub body_object_id: String,
    pub body_ciphertext_sha256: String,
    pub body_size_bytes: i64,
    pub referenced_object_ids: Vec<String>,
    pub signature: Vec<u8>,
    pub server_seq: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ListCommitsOutput {
    pub commits: Vec<SyncCommitHeader>,
    pub has_more: bool,
    pub next_after_server_seq: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PublishCommitInput {
    pub workspace_id: String,
    pub commit_id: String,
    pub commit_kind: SyncCommitKind,
    pub expected_head_commit_id: String,
    pub parent_commit_ids: Vec<String>,
    pub author_device_id: String,
    pub device_seq: i64,
    pub body_object_id: String,
    pub body_ciphertext_sha256: String,
    pub body_size_bytes: i64,
    pub referenced_object_ids: Vec<String>,
    pub signature: Vec<u8>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PublishedCommit {
    pub commit_id: String,
    pub head_version: i64,
    pub idempotent: bool,
}

#[async_trait]
pub trait SyncSetupApi: Send + Sync {
    async fn get_account_key_state(&self) -> SyncResult<Option<SyncAccountKeyMetadata>>;

    async fn create_account_key(
        &self,
        input: CreateAccountKeyInput,
    ) -> SyncResult<(SyncAccountKeyMetadata, SyncAccountKeyEnvelopeMetadata)>;

    async fn list_account_key_envelopes(&self) -> SyncResult<Vec<SyncAccountKeyEnvelopeMetadata>>;

    async fn put_account_key_envelope(
        &self,
        input: PutAccountKeyEnvelopeInput,
    ) -> SyncResult<SyncAccountKeyEnvelopeMetadata>;

    async fn create_workspace(&self, crypto_version: &str) -> SyncResult<SyncWorkspaceMetadata>;

    async fn list_workspaces(&self) -> SyncResult<Vec<SyncWorkspaceMetadata>>;

    async fn delete_workspace(&self, workspace_id: &str) -> SyncResult<()>;

    async fn update_workspace_metadata(
        &self,
        input: UpdateWorkspaceMetadataInput,
    ) -> SyncResult<SyncWorkspaceMetadata>;

    async fn update_workspace_key(
        &self,
        input: UpdateWorkspaceKeyInput,
    ) -> SyncResult<SyncWorkspaceMetadata>;

    async fn register_device(
        &self,
        workspace_id: &str,
        signing_public_key: Vec<u8>,
        encryption_public_key: Vec<u8>,
        encrypted_device_name: Vec<u8>,
    ) -> SyncResult<SyncDeviceMetadata>;

    async fn put_key_envelope(
        &self,
        input: PutKeyEnvelopeInput,
    ) -> SyncResult<SyncKeyEnvelopeMetadata>;

    async fn list_key_envelopes(
        &self,
        workspace_id: &str,
    ) -> SyncResult<Vec<SyncKeyEnvelopeMetadata>>;

    async fn update_device_metadata(
        &self,
        input: UpdateDeviceMetadataInput,
    ) -> SyncResult<SyncDeviceMetadata>;
}

#[async_trait]
pub trait SyncCommitApi: Send + Sync {
    async fn get_head(&self, workspace_id: &str) -> SyncResult<SyncHead>;
    async fn list_commits(
        &self,
        workspace_id: &str,
        after_server_seq: i64,
        page_size: i32,
    ) -> SyncResult<ListCommitsOutput>;
    async fn publish_commit(&self, input: PublishCommitInput) -> SyncResult<PublishedCommit>;
}

#[async_trait]
pub trait SyncTransferApi: Send + Sync {
    async fn reserve_object_ids(
        &self,
        workspace_id: &str,
        device_id: &str,
        objects: Vec<ObjectReservationInput>,
    ) -> SyncResult<Vec<ReservedObject>>;

    async fn create_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<ObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadTargetDescriptor>>;

    async fn complete_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<CompletedObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadCompletion>>;

    async fn create_object_download_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        object_ids: Vec<String>,
    ) -> SyncResult<Vec<ObjectDownloadTargetDescriptor>>;
}

#[derive(Clone)]
pub struct ConnectSyncClient {
    authorization_header: Arc<parking_lot::Mutex<Option<String>>>,
    refresh_authorization_header: Option<RefreshAuthorizationHeader>,
    refresh_lock: Arc<tokio::sync::Mutex<()>>,
}

impl Default for ConnectSyncClient {
    fn default() -> Self {
        Self {
            authorization_header: Arc::new(parking_lot::Mutex::new(None)),
            refresh_authorization_header: None,
            refresh_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }
}

impl fmt::Debug for ConnectSyncClient {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ConnectSyncClient")
            .field(
                "has_authorization_header",
                &self.authorization_header.lock().is_some(),
            )
            .field(
                "has_refresh_authorization_header",
                &self.refresh_authorization_header.is_some(),
            )
            .finish()
    }
}

impl ConnectSyncClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_authorization_header(header: impl Into<String>) -> Self {
        Self {
            authorization_header: Arc::new(parking_lot::Mutex::new(Some(header.into()))),
            refresh_authorization_header: None,
            refresh_lock: Arc::new(tokio::sync::Mutex::new(())),
        }
    }

    pub fn with_bearer_access_token(access_token: impl Into<String>) -> Self {
        Self::with_authorization_header(format!("Bearer {}", access_token.into()))
    }

    pub fn with_authorization_refresh(
        mut self,
        refresh_authorization_header: RefreshAuthorizationHeader,
    ) -> Self {
        self.refresh_authorization_header = Some(refresh_authorization_header);
        self
    }

    fn call_options(&self) -> CallOptions {
        Self::call_options_for(self.authorization_header())
    }

    fn authorization_header(&self) -> Option<String> {
        self.authorization_header.lock().clone()
    }

    fn call_options_for(authorization_header: Option<String>) -> CallOptions {
        match authorization_header {
            Some(header) => CallOptions::default().with_header("authorization", header),
            None => CallOptions::default(),
        }
    }

    async fn call_with_auth_retry<T, F, Fut>(&self, operation: &str, call: F) -> SyncResult<T>
    where
        F: Fn(CallOptions) -> Fut,
        Fut: Future<Output = Result<T, ConnectError>>,
    {
        let attempted_header = self.authorization_header();
        match call(Self::call_options_for(attempted_header.clone())).await {
            Ok(response) => Ok(response),
            Err(error) if error.code == ErrorCode::Unauthenticated => {
                let Some(refresh_authorization_header) = &self.refresh_authorization_header else {
                    return Err(sync_rpc_error(operation, error));
                };
                let refreshed_header = {
                    let _guard = self.refresh_lock.lock().await;
                    let current_header = self.authorization_header();
                    if current_header != attempted_header {
                        current_header
                    } else {
                        let Some(refreshed_header) = refresh_authorization_header().await? else {
                            *self.authorization_header.lock() = None;
                            return Err(SyncError::LoginRequired);
                        };
                        *self.authorization_header.lock() = Some(refreshed_header.clone());
                        Some(refreshed_header)
                    }
                };
                let Some(refreshed_header) = refreshed_header else {
                    return Err(SyncError::LoginRequired);
                };
                call(Self::call_options_for(Some(refreshed_header)))
                    .await
                    .map_err(|retry_error| sync_rpc_error(operation, retry_error))
            }
            Err(error) => Err(sync_rpc_error(operation, error)),
        }
    }
}

fn sync_rpc_error(operation: &str, error: ConnectError) -> SyncError {
    let is_sync_disabled = error
        .message
        .as_deref()
        .map(|message| message.to_lowercase().contains("sync disabled"))
        .unwrap_or(false);
    let message = format!("{operation} failed: {error}");
    match error.code {
        ErrorCode::Unauthenticated => SyncError::LoginRequired,
        ErrorCode::PermissionDenied => SyncError::PermissionRequired,
        ErrorCode::ResourceExhausted => SyncError::QuotaExceeded(message),
        ErrorCode::FailedPrecondition if is_sync_disabled => SyncError::SyncDisabled,
        ErrorCode::Unavailable | ErrorCode::DeadlineExceeded => SyncError::Offline(message),
        ErrorCode::Internal | ErrorCode::Unknown => SyncError::Server(message),
        _ => SyncError::Transport(message),
    }
}

#[async_trait]
impl SyncSetupApi for ConnectSyncClient {
    async fn get_account_key_state(&self) -> SyncResult<Option<SyncAccountKeyMetadata>> {
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let request = GetAccountKeyStateRequest::default();
        let response = self
            .call_with_auth_retry("GetAccountKeyState", |options| {
                client.get_account_key_state_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        response
            .account_key
            .as_option()
            .map(account_key_from_proto)
            .transpose()
    }

    async fn create_account_key(
        &self,
        input: CreateAccountKeyInput,
    ) -> SyncResult<(SyncAccountKeyMetadata, SyncAccountKeyEnvelopeMetadata)> {
        let request = CreateAccountKeyRequest {
            account_key_id: Some(input.account_key_id),
            crypto_version: Some(input.crypto_version),
            envelope_id: Some(input.envelope_id),
            recipient_type: Some(input.recipient_type.into()),
            key_version: Some(input.key_version),
            kdf_params_json: Some(input.kdf_params_json),
            encrypted_envelope: Some(input.encrypted_envelope),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("CreateAccountKey", |options| {
                client.create_account_key_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        let account_key =
            account_key_from_proto(response.account_key.as_option().ok_or_else(|| {
                SyncError::Transport("sync response missing account key".into())
            })?)?;
        let envelope =
            account_key_envelope_from_proto(response.envelope.as_option().ok_or_else(|| {
                SyncError::Transport("sync response missing account key envelope".into())
            })?)?;
        Ok((account_key, envelope))
    }

    async fn list_account_key_envelopes(&self) -> SyncResult<Vec<SyncAccountKeyEnvelopeMetadata>> {
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let request = ListAccountKeyEnvelopesRequest::default();
        let response = self
            .call_with_auth_retry("ListAccountKeyEnvelopes", |options| {
                client.list_account_key_envelopes_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        response
            .envelopes
            .iter()
            .map(account_key_envelope_from_proto)
            .collect()
    }

    async fn put_account_key_envelope(
        &self,
        input: PutAccountKeyEnvelopeInput,
    ) -> SyncResult<SyncAccountKeyEnvelopeMetadata> {
        let request = PutAccountKeyEnvelopeRequest {
            envelope_id: Some(input.envelope_id),
            recipient_type: Some(input.recipient_type.into()),
            key_version: Some(input.key_version),
            kdf_params_json: Some(input.kdf_params_json),
            encrypted_envelope: Some(input.encrypted_envelope),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("PutAccountKeyEnvelope", |options| {
                client.put_account_key_envelope_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        account_key_envelope_from_proto(response.envelope.as_option().ok_or_else(|| {
            SyncError::Transport("sync response missing account key envelope".into())
        })?)
    }

    async fn create_workspace(&self, crypto_version: &str) -> SyncResult<SyncWorkspaceMetadata> {
        let request = CreateWorkspaceRequest {
            crypto_version: Some(crypto_version.to_string()),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("CreateWorkspace", |options| {
                client.create_workspace_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        workspace_from_proto(
            response
                .workspace
                .as_option()
                .ok_or_else(|| SyncError::Transport("sync response missing workspace".into()))?,
        )
    }

    async fn list_workspaces(&self) -> SyncResult<Vec<SyncWorkspaceMetadata>> {
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let request = ListWorkspacesRequest::default();
        let response = self
            .call_with_auth_retry("ListWorkspaces", |options| {
                client.list_workspaces_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        response
            .workspaces
            .iter()
            .map(workspace_from_proto)
            .collect()
    }

    async fn delete_workspace(&self, workspace_id: &str) -> SyncResult<()> {
        let request = DeleteWorkspaceRequest {
            workspace_id: Some(workspace_id.to_string()),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        self.call_with_auth_retry("DeleteWorkspace", |options| {
            client.delete_workspace_with_options(request.clone(), options)
        })
        .await?;
        Ok(())
    }

    async fn update_workspace_metadata(
        &self,
        input: UpdateWorkspaceMetadataInput,
    ) -> SyncResult<SyncWorkspaceMetadata> {
        let request = UpdateWorkspaceMetadataRequest {
            workspace_id: Some(input.workspace_id),
            encrypted_metadata: Some(input.encrypted_metadata),
            metadata_version: Some(input.metadata_version),
            expected_metadata_version: Some(input.expected_metadata_version),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("UpdateWorkspaceMetadata", |options| {
                client.update_workspace_metadata_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        workspace_from_proto(
            response
                .workspace
                .as_option()
                .ok_or_else(|| SyncError::Transport("sync response missing workspace".into()))?,
        )
    }

    async fn update_workspace_key(
        &self,
        input: UpdateWorkspaceKeyInput,
    ) -> SyncResult<SyncWorkspaceMetadata> {
        let request = UpdateWorkspaceKeyRequest {
            workspace_id: Some(input.workspace_id),
            encrypted_workspace_key: Some(input.encrypted_workspace_key),
            workspace_key_version: Some(input.workspace_key_version),
            expected_workspace_key_version: Some(input.expected_workspace_key_version),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("UpdateWorkspaceKey", |options| {
                client.update_workspace_key_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        workspace_from_proto(
            response
                .workspace
                .as_option()
                .ok_or_else(|| SyncError::Transport("sync response missing workspace".into()))?,
        )
    }

    async fn register_device(
        &self,
        workspace_id: &str,
        signing_public_key: Vec<u8>,
        encryption_public_key: Vec<u8>,
        encrypted_device_name: Vec<u8>,
    ) -> SyncResult<SyncDeviceMetadata> {
        let request = RegisterDeviceRequest {
            workspace_id: Some(workspace_id.to_string()),
            signing_public_key: Some(signing_public_key),
            encryption_public_key: Some(encryption_public_key),
            encrypted_device_name: Some(encrypted_device_name),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("RegisterDevice", |options| {
                client.register_device_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        device_from_proto(
            response
                .device
                .as_option()
                .ok_or_else(|| SyncError::Transport("sync response missing device".into()))?,
        )
    }

    async fn put_key_envelope(
        &self,
        input: PutKeyEnvelopeInput,
    ) -> SyncResult<SyncKeyEnvelopeMetadata> {
        let request = PutKeyEnvelopeRequest {
            workspace_id: Some(input.workspace_id),
            envelope_id: Some(input.envelope_id),
            recipient_type: Some(input.recipient_type.into()),
            recipient_device_id: input.recipient_device_id,
            key_version: Some(input.key_version),
            kdf_params_json: Some(input.kdf_params_json),
            encrypted_envelope: Some(input.encrypted_envelope),
            created_by_device_id: Some(input.created_by_device_id),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("PutKeyEnvelope", |options| {
                client.put_key_envelope_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        key_envelope_from_proto(
            response
                .envelope
                .as_option()
                .ok_or_else(|| SyncError::Transport("sync response missing key envelope".into()))?,
        )
    }

    async fn list_key_envelopes(
        &self,
        workspace_id: &str,
    ) -> SyncResult<Vec<SyncKeyEnvelopeMetadata>> {
        let request = ListKeyEnvelopesRequest {
            workspace_id: Some(workspace_id.to_string()),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("ListKeyEnvelopes", |options| {
                client.list_key_envelopes_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        response
            .envelopes
            .iter()
            .map(key_envelope_from_proto)
            .collect()
    }

    async fn update_device_metadata(
        &self,
        input: UpdateDeviceMetadataInput,
    ) -> SyncResult<SyncDeviceMetadata> {
        let request = UpdateDeviceMetadataRequest {
            workspace_id: Some(input.workspace_id),
            device_id: Some(input.device_id),
            encrypted_device_name: Some(input.encrypted_device_name),
            metadata_version: Some(input.metadata_version),
            expected_metadata_version: Some(input.expected_metadata_version),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("UpdateDeviceMetadata", |options| {
                client.update_device_metadata_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        device_from_proto(
            response
                .device
                .as_option()
                .ok_or_else(|| SyncError::Transport("sync response missing device".into()))?,
        )
    }
}

#[async_trait]
impl SyncCommitApi for ConnectSyncClient {
    async fn get_head(&self, workspace_id: &str) -> SyncResult<SyncHead> {
        let request = GetHeadRequest {
            workspace_id: Some(workspace_id.to_string()),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("GetHead", |options| {
                client.get_head_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        Ok(SyncHead {
            current_head_commit_id: response.current_head_commit_id.unwrap_or_default(),
            head_version: response.head_version.unwrap_or_default(),
            latest_checkpoint_commit_id: response.latest_checkpoint_commit_id.unwrap_or_default(),
        })
    }

    async fn list_commits(
        &self,
        workspace_id: &str,
        after_server_seq: i64,
        page_size: i32,
    ) -> SyncResult<ListCommitsOutput> {
        let request = ListCommitsRequest {
            workspace_id: Some(workspace_id.to_string()),
            after_server_seq: Some(after_server_seq),
            page_size: Some(page_size),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("ListCommits", |options| {
                client.list_commits_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        Ok(ListCommitsOutput {
            commits: response
                .commits
                .iter()
                .map(sync_commit_header_from_proto)
                .collect::<SyncResult<Vec<_>>>()?,
            has_more: response.has_more.unwrap_or(false),
            next_after_server_seq: response.next_after_server_seq.unwrap_or(after_server_seq),
        })
    }

    async fn publish_commit(&self, input: PublishCommitInput) -> SyncResult<PublishedCommit> {
        let request = PublishCommitRequest {
            workspace_id: Some(input.workspace_id),
            commit_id: Some(input.commit_id),
            commit_kind: Some(input.commit_kind.into()),
            expected_head_commit_id: Some(input.expected_head_commit_id),
            parent_commit_ids: input.parent_commit_ids,
            author_device_id: Some(input.author_device_id),
            device_seq: Some(input.device_seq),
            body_object_id: Some(input.body_object_id),
            body_ciphertext_sha256: Some(input.body_ciphertext_sha256),
            body_size_bytes: Some(input.body_size_bytes),
            referenced_object_ids: input.referenced_object_ids,
            signature: Some(input.signature),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("PublishCommit", |options| {
                client.publish_commit_with_options(request.clone(), options)
            })
            .await?
            .into_owned();
        let commit = response
            .commit
            .as_option()
            .ok_or_else(|| SyncError::Transport("sync response missing commit".into()))?;
        Ok(PublishedCommit {
            commit_id: required_string(commit.commit_id.clone(), "commit.commit_id")?,
            head_version: response.head_version.unwrap_or_default(),
            idempotent: response.idempotent.unwrap_or(false),
        })
    }
}

#[async_trait]
impl SyncTransferApi for ConnectSyncClient {
    async fn reserve_object_ids(
        &self,
        workspace_id: &str,
        device_id: &str,
        objects: Vec<ObjectReservationInput>,
    ) -> SyncResult<Vec<ReservedObject>> {
        let request = ReserveObjectIdsRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            objects: objects
                .into_iter()
                .map(|object| ObjectReservationRequest {
                    client_object_ref: Some(object.client_object_ref),
                    kind: Some(object.kind.into()),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("ReserveObjectIds", |options| {
                client.reserve_object_ids_with_options(request.clone(), options)
            })
            .await?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(reserved_object_from_proto)
            .collect()
    }

    async fn create_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<ObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadTargetDescriptor>> {
        let request = CreateObjectUploadBatchRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            upload_attempt_id: Some(upload_attempt_id.to_string()),
            objects: objects
                .into_iter()
                .map(|object| UploadObjectDescriptor {
                    object_id: Some(object.object_id),
                    kind: Some(object.kind.into()),
                    ciphertext_sha256: Some(object.ciphertext_sha256),
                    size_bytes: Some(object.size_bytes),
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("CreateObjectUploadBatch", |options| {
                client.create_object_upload_batch_with_options(request.clone(), options)
            })
            .await?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(upload_target_from_proto)
            .collect()
    }

    async fn complete_object_upload_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        upload_attempt_id: &str,
        objects: Vec<CompletedObjectUploadDescriptor>,
    ) -> SyncResult<Vec<ObjectUploadCompletion>> {
        let request = CompleteObjectUploadBatchRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            upload_attempt_id: Some(upload_attempt_id.to_string()),
            objects: objects
                .into_iter()
                .map(|object| CompletedObjectUpload {
                    object_id: Some(object.object_id),
                    ciphertext_sha256: Some(object.ciphertext_sha256),
                    size_bytes: Some(object.size_bytes),
                    provider_etag: object.provider_etag,
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("CompleteObjectUploadBatch", |options| {
                client.complete_object_upload_batch_with_options(request.clone(), options)
            })
            .await?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(upload_completion_from_proto)
            .collect()
    }

    async fn create_object_download_batch(
        &self,
        workspace_id: &str,
        device_id: &str,
        object_ids: Vec<String>,
    ) -> SyncResult<Vec<ObjectDownloadTargetDescriptor>> {
        let request = CreateObjectDownloadBatchRequest {
            workspace_id: Some(workspace_id.to_string()),
            device_id: Some(device_id.to_string()),
            object_ids,
            ..Default::default()
        };
        let client = contract_client::sync_service_client().map_err(SyncError::Transport)?;
        let response = self
            .call_with_auth_retry("CreateObjectDownloadBatch", |options| {
                client.create_object_download_batch_with_options(request.clone(), options)
            })
            .await?
            .into_owned();

        response
            .objects
            .into_iter()
            .map(download_target_from_proto)
            .collect()
    }
}

fn reserved_object_from_proto(value: ObjectReservation) -> SyncResult<ReservedObject> {
    Ok(ReservedObject {
        client_object_ref: required_string(value.client_object_ref, "client_object_ref")?,
        object_id: required_string(value.object_id, "object_id")?,
        kind: required_enum(value.kind, "kind")?,
    })
}

fn workspace_from_proto(value: &SyncWorkspace) -> SyncResult<SyncWorkspaceMetadata> {
    Ok(SyncWorkspaceMetadata {
        workspace_id: required_string(value.workspace_id.clone(), "workspace.workspace_id")?,
        current_head_commit_id: value.current_head_commit_id.clone().unwrap_or_default(),
        head_version: value.head_version.unwrap_or_default(),
        crypto_version: required_string(value.crypto_version.clone(), "workspace.crypto_version")?,
        encrypted_metadata: value.encrypted_metadata.clone().unwrap_or_default(),
        metadata_version: value.metadata_version.unwrap_or_default(),
        encrypted_workspace_key: value.encrypted_workspace_key.clone().unwrap_or_default(),
        workspace_key_version: value.workspace_key_version.unwrap_or_default(),
    })
}

fn device_from_proto(value: &SyncDevice) -> SyncResult<SyncDeviceMetadata> {
    Ok(SyncDeviceMetadata {
        device_id: required_string(value.device_id.clone(), "device.device_id")?,
        workspace_id: required_string(value.workspace_id.clone(), "device.workspace_id")?,
        signing_public_key: value.signing_public_key.clone().unwrap_or_default(),
        encryption_public_key: value.encryption_public_key.clone().unwrap_or_default(),
        encrypted_device_name: value.encrypted_device_name.clone().unwrap_or_default(),
        metadata_version: value.metadata_version.unwrap_or_default(),
        last_device_seq: value.last_device_seq.unwrap_or_default(),
    })
}

fn account_key_from_proto(value: &SyncAccountKey) -> SyncResult<SyncAccountKeyMetadata> {
    Ok(SyncAccountKeyMetadata {
        account_key_id: required_string(
            value.account_key_id.clone(),
            "account_key.account_key_id",
        )?,
        crypto_version: required_string(
            value.crypto_version.clone(),
            "account_key.crypto_version",
        )?,
    })
}

fn account_key_envelope_from_proto(
    value: &SyncAccountKeyEnvelope,
) -> SyncResult<SyncAccountKeyEnvelopeMetadata> {
    Ok(SyncAccountKeyEnvelopeMetadata {
        account_key_id: required_string(
            value.account_key_id.clone(),
            "account_envelope.account_key_id",
        )?,
        envelope_id: required_string(value.envelope_id.clone(), "account_envelope.envelope_id")?,
        recipient_type: required_enum(value.recipient_type, "account_envelope.recipient_type")?,
        key_version: required_i64(value.key_version, "account_envelope.key_version")?,
        kdf_params_json: value.kdf_params_json.clone().unwrap_or_default(),
        encrypted_envelope: value.encrypted_envelope.clone().unwrap_or_default(),
    })
}

fn key_envelope_from_proto(value: &SyncKeyEnvelope) -> SyncResult<SyncKeyEnvelopeMetadata> {
    Ok(SyncKeyEnvelopeMetadata {
        workspace_id: required_string(value.workspace_id.clone(), "envelope.workspace_id")?,
        envelope_id: required_string(value.envelope_id.clone(), "envelope.envelope_id")?,
        recipient_type: required_enum(value.recipient_type, "envelope.recipient_type")?,
        recipient_device_id: value.recipient_device_id.clone().unwrap_or_default(),
        key_version: required_i64(value.key_version, "envelope.key_version")?,
        kdf_params_json: value.kdf_params_json.clone().unwrap_or_default(),
        encrypted_envelope: value.encrypted_envelope.clone().unwrap_or_default(),
        created_by_device_id: required_string(
            value.created_by_device_id.clone(),
            "envelope.created_by_device_id",
        )?,
    })
}

fn sync_commit_header_from_proto(value: &SyncCommit) -> SyncResult<SyncCommitHeader> {
    Ok(SyncCommitHeader {
        commit_id: required_string(value.commit_id.clone(), "commit.commit_id")?,
        commit_kind: required_enum(value.commit_kind, "commit.commit_kind")?,
        expected_head_commit_id: value.expected_head_commit_id.clone().unwrap_or_default(),
        parent_commit_ids: value.parent_commit_ids.clone(),
        author_device_id: required_string(
            value.author_device_id.clone(),
            "commit.author_device_id",
        )?,
        device_seq: required_i64(value.device_seq, "commit.device_seq")?,
        body_object_id: required_string(value.body_object_id.clone(), "commit.body_object_id")?,
        body_ciphertext_sha256: required_string(
            value.body_ciphertext_sha256.clone(),
            "commit.body_ciphertext_sha256",
        )?,
        body_size_bytes: required_i64(value.body_size_bytes, "commit.body_size_bytes")?,
        referenced_object_ids: value.referenced_object_ids.clone(),
        signature: value.signature.clone().unwrap_or_default(),
        server_seq: required_i64(value.server_seq, "commit.server_seq")?,
    })
}

fn upload_target_from_proto(
    value: kuku_contract::proto::kuku::sync::v1::ObjectUploadTarget,
) -> SyncResult<ObjectUploadTargetDescriptor> {
    Ok(ObjectUploadTargetDescriptor {
        object_id: required_string(value.object_id, "object_id")?,
        put_url: required_string(value.put_url, "put_url")?,
        required_headers: headers_from_proto(value.required_headers)?,
    })
}

fn upload_completion_from_proto(value: ObjectUploadResult) -> SyncResult<ObjectUploadCompletion> {
    let object = value
        .object
        .as_option()
        .map(sync_object_metadata_from_proto)
        .transpose()?;
    Ok(ObjectUploadCompletion {
        object,
        error_reason: value.error_reason.and_then(|reason| reason.as_known()),
    })
}

fn download_target_from_proto(
    value: ObjectDownloadTarget,
) -> SyncResult<ObjectDownloadTargetDescriptor> {
    Ok(ObjectDownloadTargetDescriptor {
        object_id: required_string(value.object_id, "object_id")?,
        kind: required_enum(value.kind, "kind")?,
        get_url: required_string(value.get_url, "get_url")?,
        required_headers: headers_from_proto(value.required_headers)?,
        ciphertext_sha256: required_string(value.ciphertext_sha256, "ciphertext_sha256")?,
        size_bytes: required_i64(value.size_bytes, "size_bytes")?,
    })
}

fn sync_object_metadata_from_proto(value: &SyncObject) -> SyncResult<UploadedObjectMetadata> {
    Ok(UploadedObjectMetadata {
        object_id: required_string(value.object_id.clone(), "object.object_id")?,
        ciphertext_sha256: required_string(
            value.ciphertext_sha256.clone(),
            "object.ciphertext_sha256",
        )?,
        size_bytes: required_i64(value.size_bytes, "object.size_bytes")?,
    })
}

fn headers_from_proto(headers: Vec<SyncHttpHeader>) -> SyncResult<Vec<HttpHeader>> {
    headers
        .into_iter()
        .map(|header| {
            Ok(HttpHeader {
                name: required_string(header.name, "header.name")?,
                value: required_string(header.value, "header.value")?,
            })
        })
        .collect()
}

fn required_string(value: Option<String>, field: &str) -> SyncResult<String> {
    value
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| SyncError::Transport(format!("sync response missing {field}")))
}

fn required_i64(value: Option<i64>, field: &str) -> SyncResult<i64> {
    value.ok_or_else(|| SyncError::Transport(format!("sync response missing {field}")))
}

fn required_enum<E>(value: Option<EnumValue<E>>, field: &str) -> SyncResult<E>
where
    E: kuku_contract::buffa::Enumeration,
{
    value
        .and_then(|value| value.as_known())
        .ok_or_else(|| SyncError::Transport(format!("sync response missing {field}")))
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;
    use tokio::runtime::Builder;
    use tokio::sync::Barrier;

    #[test]
    fn call_with_auth_retry_refreshes_after_unauthenticated() {
        block_on(async {
            let refreshes = Arc::new(AtomicUsize::new(0));
            let refreshes_for_callback = refreshes.clone();
            let client = ConnectSyncClient::with_authorization_header("Bearer stale")
                .with_authorization_refresh(Arc::new(move || {
                    let refreshes = refreshes_for_callback.clone();
                    Box::pin(async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Ok(Some("Bearer fresh".to_string()))
                    })
                }));
            let calls = Arc::new(AtomicUsize::new(0));
            let calls_for_rpc = calls.clone();

            let result = client
                .call_with_auth_retry("GetHead", move |_options| {
                    let calls = calls_for_rpc.clone();
                    async move {
                        let attempt = calls.fetch_add(1, Ordering::SeqCst);
                        if attempt == 0 {
                            Err(ConnectError::new(
                                ErrorCode::Unauthenticated,
                                "not authenticated",
                            ))
                        } else {
                            Ok("ok")
                        }
                    }
                })
                .await;

            assert_eq!(result.expect("retry should succeed"), "ok");
            assert_eq!(calls.load(Ordering::SeqCst), 2);
            assert_eq!(refreshes.load(Ordering::SeqCst), 1);
            assert_eq!(
                client.authorization_header.lock().as_deref(),
                Some("Bearer fresh")
            );
        });
    }

    #[test]
    fn call_with_auth_retry_clears_header_when_refresh_returns_none() {
        block_on(async {
            let refreshes = Arc::new(AtomicUsize::new(0));
            let refreshes_for_callback = refreshes.clone();
            let client = ConnectSyncClient::with_authorization_header("Bearer stale")
                .with_authorization_refresh(Arc::new(move || {
                    let refreshes = refreshes_for_callback.clone();
                    Box::pin(async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Ok(None)
                    })
                }));
            let calls = Arc::new(AtomicUsize::new(0));
            let calls_for_rpc = calls.clone();

            let result = client
                .call_with_auth_retry("GetHead", move |_options| {
                    let calls = calls_for_rpc.clone();
                    async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        Err::<(), _>(ConnectError::new(
                            ErrorCode::Unauthenticated,
                            "not authenticated",
                        ))
                    }
                })
                .await;

            assert!(matches!(result, Err(SyncError::LoginRequired)));
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            assert_eq!(refreshes.load(Ordering::SeqCst), 1);
            assert_eq!(client.authorization_header.lock().as_deref(), None);
        });
    }

    #[test]
    fn call_with_auth_retry_returns_refresh_error_without_retry() {
        block_on(async {
            let refreshes = Arc::new(AtomicUsize::new(0));
            let refreshes_for_callback = refreshes.clone();
            let client = ConnectSyncClient::with_authorization_header("Bearer stale")
                .with_authorization_refresh(Arc::new(move || {
                    let refreshes = refreshes_for_callback.clone();
                    Box::pin(async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Err(SyncError::Transport("refresh failed".into()))
                    })
                }));
            let calls = Arc::new(AtomicUsize::new(0));
            let calls_for_rpc = calls.clone();

            let result = client
                .call_with_auth_retry("GetHead", move |_options| {
                    let calls = calls_for_rpc.clone();
                    async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        Err::<(), _>(ConnectError::new(
                            ErrorCode::Unauthenticated,
                            "not authenticated",
                        ))
                    }
                })
                .await;

            assert!(
                matches!(result, Err(SyncError::Transport(message)) if message == "refresh failed")
            );
            assert_eq!(calls.load(Ordering::SeqCst), 1);
            assert_eq!(refreshes.load(Ordering::SeqCst), 1);
            assert_eq!(
                client.authorization_header.lock().as_deref(),
                Some("Bearer stale")
            );
        });
    }

    #[test]
    fn call_with_auth_retry_maps_unauthenticated_retry_to_login_required() {
        block_on(async {
            let refreshes = Arc::new(AtomicUsize::new(0));
            let refreshes_for_callback = refreshes.clone();
            let client = ConnectSyncClient::with_authorization_header("Bearer stale")
                .with_authorization_refresh(Arc::new(move || {
                    let refreshes = refreshes_for_callback.clone();
                    Box::pin(async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Ok(Some("Bearer fresh".to_string()))
                    })
                }));
            let calls = Arc::new(AtomicUsize::new(0));
            let calls_for_rpc = calls.clone();

            let result = client
                .call_with_auth_retry("GetHead", move |_options| {
                    let calls = calls_for_rpc.clone();
                    async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        Err::<(), _>(ConnectError::new(
                            ErrorCode::Unauthenticated,
                            "not authenticated",
                        ))
                    }
                })
                .await;

            assert!(matches!(result, Err(SyncError::LoginRequired)));
            assert_eq!(calls.load(Ordering::SeqCst), 2);
            assert_eq!(refreshes.load(Ordering::SeqCst), 1);
            assert_eq!(
                client.authorization_header.lock().as_deref(),
                Some("Bearer fresh")
            );
        });
    }

    #[test]
    fn call_with_auth_retry_coalesces_concurrent_refreshes() {
        block_on(async {
            let refreshes = Arc::new(AtomicUsize::new(0));
            let refreshes_for_callback = refreshes.clone();
            let client = ConnectSyncClient::with_authorization_header("Bearer stale")
                .with_authorization_refresh(Arc::new(move || {
                    let refreshes = refreshes_for_callback.clone();
                    Box::pin(async move {
                        refreshes.fetch_add(1, Ordering::SeqCst);
                        Ok(Some("Bearer fresh".to_string()))
                    })
                }));
            let first_attempts = Arc::new(AtomicUsize::new(0));
            let calls = Arc::new(AtomicUsize::new(0));
            let barrier = Arc::new(Barrier::new(2));
            let make_rpc = |first_attempts: Arc<AtomicUsize>,
                            calls: Arc<AtomicUsize>,
                            barrier: Arc<Barrier>| {
                move |_options| {
                    let first_attempts = first_attempts.clone();
                    let calls = calls.clone();
                    let barrier = barrier.clone();
                    async move {
                        calls.fetch_add(1, Ordering::SeqCst);
                        if first_attempts.fetch_add(1, Ordering::SeqCst) < 2 {
                            barrier.wait().await;
                            Err(ConnectError::new(
                                ErrorCode::Unauthenticated,
                                "not authenticated",
                            ))
                        } else {
                            Ok(())
                        }
                    }
                }
            };

            let first = client.call_with_auth_retry(
                "GetHead",
                make_rpc(first_attempts.clone(), calls.clone(), barrier.clone()),
            );
            let second = client.call_with_auth_retry(
                "GetHead",
                make_rpc(first_attempts.clone(), calls.clone(), barrier.clone()),
            );
            let (first, second) = tokio::join!(first, second);

            assert!(first.is_ok());
            assert!(second.is_ok());
            assert_eq!(calls.load(Ordering::SeqCst), 4);
            assert_eq!(refreshes.load(Ordering::SeqCst), 1);
            assert_eq!(
                client.authorization_header.lock().as_deref(),
                Some("Bearer fresh")
            );
        });
    }

    #[test]
    fn sync_rpc_error_maps_connect_codes_to_sync_errors() {
        assert!(matches!(
            sync_rpc_error(
                "GetHead",
                ConnectError::new(ErrorCode::Unauthenticated, "not authenticated")
            ),
            SyncError::LoginRequired
        ));
        assert!(matches!(
            sync_rpc_error(
                "GetHead",
                ConnectError::new(ErrorCode::PermissionDenied, "permission denied")
            ),
            SyncError::PermissionRequired
        ));
        assert!(matches!(
            sync_rpc_error(
                "CreateWorkspace",
                ConnectError::new(ErrorCode::FailedPrecondition, "sync disabled")
            ),
            SyncError::SyncDisabled
        ));
        assert!(matches!(
            sync_rpc_error(
                "CreateObjectUploadBatch",
                ConnectError::new(ErrorCode::ResourceExhausted, "sync quota exceeded")
            ),
            SyncError::QuotaExceeded(_)
        ));
        assert!(matches!(
            sync_rpc_error(
                "ListCommits",
                ConnectError::new(ErrorCode::Unavailable, "server unavailable")
            ),
            SyncError::Offline(_)
        ));
    }

    fn block_on<T>(future: impl std::future::Future<Output = T>) -> T {
        Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("build tokio runtime")
            .block_on(future)
    }
}
