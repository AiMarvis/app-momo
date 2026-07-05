/// Full service name for this service.
pub const AI_SERVICE_SERVICE_NAME: &str = "kuku.ai.v1.AIService";
/// ---------------------------------------------------------------------------
/// AIService - server-backed AI service
/// ---------------------------------------------------------------------------
///
/// # Implementing handlers
///
/// Handlers receive requests as `OwnedView<FooView<'static>>`, which gives
/// zero-copy borrowed access to fields (e.g. `request.name` is a `&str`
/// into the decoded buffer). The view can be held across `.await` points.
///
/// Implement methods with plain `async fn`; the returned future satisfies
/// the `Send` bound automatically. See the
/// [buffa user guide](https://github.com/anthropics/buffa/blob/main/docs/guide.md#ownedview-in-async-trait-implementations)
/// for zero-copy access patterns and when `to_owned_message()` is needed.
#[allow(clippy::type_complexity)]
pub trait AiService: Send + Sync + 'static {
    /// Streams a single AI turn. Emits text deltas as they arrive, followed by
    /// buffered tool calls (if any), then a terminal Finished event. The stream
    /// closes at the end of the turn; on FINISH_REASON_TOOL_CALLS the caller
    /// executes the tools and issues a follow-up Complete call with the tool
    /// results appended to `messages`. The server never holds a connection
    /// across tool-call rounds.
    /// - Requires authentication.
    fn complete(
        &self,
        ctx: ::connectrpc::Context,
        request: ::buffa::view::OwnedView<
            crate::proto::kuku::ai::v1::CompleteRequestView<'static>,
        >,
    ) -> impl ::std::future::Future<
        Output = Result<
            (
                ::std::pin::Pin<
                    Box<
                        dyn ::futures::Stream<
                            Item = Result<
                                crate::proto::kuku::ai::v1::CompleteResponse,
                                ::connectrpc::ConnectError,
                            >,
                        > + Send,
                    >,
                >,
                ::connectrpc::Context,
            ),
            ::connectrpc::ConnectError,
        >,
    > + Send;
}
/// Extension trait for registering a service implementation with a Router.
///
/// This trait is automatically implemented for all types that implement the service trait.
///
/// # Example
///
/// ```rust,ignore
/// use std::sync::Arc;
///
/// let service = Arc::new(MyServiceImpl);
/// let router = service.register(Router::new());
/// ```
pub trait AiServiceExt: AiService {
    /// Register this service implementation with a Router.
    ///
    /// Takes ownership of the `Arc<Self>` and returns a new Router with
    /// this service's methods registered.
    fn register(
        self: ::std::sync::Arc<Self>,
        router: ::connectrpc::Router,
    ) -> ::connectrpc::Router;
}
impl<S: AiService> AiServiceExt for S {
    fn register(
        self: ::std::sync::Arc<Self>,
        router: ::connectrpc::Router,
    ) -> ::connectrpc::Router {
        router
            .route_view_server_stream(
                AI_SERVICE_SERVICE_NAME,
                "Complete",
                ::connectrpc::view_streaming_handler_fn({
                    let svc = ::std::sync::Arc::clone(&self);
                    move |ctx, req| {
                        let svc = ::std::sync::Arc::clone(&svc);
                        async move { svc.complete(ctx, req).await }
                    }
                }),
            )
    }
}
/// Monomorphic dispatcher for `AiService`.
///
/// Unlike `.register(Router)` which type-erases each method into an `Arc<dyn ErasedHandler>` stored in a `HashMap`, this struct dispatches via a compile-time `match` on method name: no vtable, no hash lookup.
///
/// # Example
///
/// ```rust,ignore
/// use connectrpc::ConnectRpcService;
///
/// let server = AiServiceServer::new(MyImpl);
/// let service = ConnectRpcService::new(server);
/// // hand `service` to axum/hyper as a fallback_service
/// ```
pub struct AiServiceServer<T> {
    inner: ::std::sync::Arc<T>,
}
impl<T: AiService> AiServiceServer<T> {
    /// Wrap a service implementation in a monomorphic dispatcher.
    pub fn new(service: T) -> Self {
        Self {
            inner: ::std::sync::Arc::new(service),
        }
    }
    /// Wrap an already-`Arc`'d service implementation.
    pub fn from_arc(inner: ::std::sync::Arc<T>) -> Self {
        Self { inner }
    }
}
impl<T> Clone for AiServiceServer<T> {
    fn clone(&self) -> Self {
        Self {
            inner: ::std::sync::Arc::clone(&self.inner),
        }
    }
}
impl<T: AiService> ::connectrpc::Dispatcher for AiServiceServer<T> {
    #[inline]
    fn lookup(
        &self,
        path: &str,
    ) -> Option<::connectrpc::dispatcher::codegen::MethodDescriptor> {
        let method = path.strip_prefix("kuku.ai.v1.AIService/")?;
        match method {
            "Complete" => {
                Some(
                    ::connectrpc::dispatcher::codegen::MethodDescriptor::server_streaming(),
                )
            }
            _ => None,
        }
    }
    fn call_unary(
        &self,
        path: &str,
        ctx: ::connectrpc::Context,
        request: ::buffa::bytes::Bytes,
        format: ::connectrpc::CodecFormat,
    ) -> ::connectrpc::dispatcher::codegen::UnaryResult {
        let Some(method) = path.strip_prefix("kuku.ai.v1.AIService/") else {
            return ::connectrpc::dispatcher::codegen::unimplemented_unary(path);
        };
        let _ = (&ctx, &request, &format);
        match method {
            _ => ::connectrpc::dispatcher::codegen::unimplemented_unary(path),
        }
    }
    fn call_server_streaming(
        &self,
        path: &str,
        ctx: ::connectrpc::Context,
        request: ::buffa::bytes::Bytes,
        format: ::connectrpc::CodecFormat,
    ) -> ::connectrpc::dispatcher::codegen::StreamingResult {
        let Some(method) = path.strip_prefix("kuku.ai.v1.AIService/") else {
            return ::connectrpc::dispatcher::codegen::unimplemented_streaming(path);
        };
        let _ = (&ctx, &request, &format);
        match method {
            "Complete" => {
                let svc = ::std::sync::Arc::clone(&self.inner);
                Box::pin(async move {
                    let req = ::connectrpc::dispatcher::codegen::decode_request_view::<
                        crate::proto::kuku::ai::v1::CompleteRequestView,
                    >(request, format)?;
                    let (resp_stream, ctx) = svc.complete(ctx, req).await?;
                    Ok((
                        ::connectrpc::dispatcher::codegen::encode_response_stream(
                            resp_stream,
                            format,
                        ),
                        ctx,
                    ))
                })
            }
            _ => ::connectrpc::dispatcher::codegen::unimplemented_streaming(path),
        }
    }
    fn call_client_streaming(
        &self,
        path: &str,
        ctx: ::connectrpc::Context,
        requests: ::connectrpc::dispatcher::codegen::RequestStream,
        format: ::connectrpc::CodecFormat,
    ) -> ::connectrpc::dispatcher::codegen::UnaryResult {
        let Some(method) = path.strip_prefix("kuku.ai.v1.AIService/") else {
            return ::connectrpc::dispatcher::codegen::unimplemented_unary(path);
        };
        let _ = (&ctx, &requests, &format);
        match method {
            _ => ::connectrpc::dispatcher::codegen::unimplemented_unary(path),
        }
    }
    fn call_bidi_streaming(
        &self,
        path: &str,
        ctx: ::connectrpc::Context,
        requests: ::connectrpc::dispatcher::codegen::RequestStream,
        format: ::connectrpc::CodecFormat,
    ) -> ::connectrpc::dispatcher::codegen::StreamingResult {
        let Some(method) = path.strip_prefix("kuku.ai.v1.AIService/") else {
            return ::connectrpc::dispatcher::codegen::unimplemented_streaming(path);
        };
        let _ = (&ctx, &requests, &format);
        match method {
            _ => ::connectrpc::dispatcher::codegen::unimplemented_streaming(path),
        }
    }
}
/// Client for this service.
///
/// Generic over `T: ClientTransport`. For **gRPC** (HTTP/2), use
/// `Http2Connection` — it has honest `poll_ready` and composes with
/// `tower::balance` for multi-connection load balancing. For **Connect
/// over HTTP/1.1** (or unknown protocol), use `HttpClient`.
///
/// # Example (gRPC / HTTP/2)
///
/// ```rust,ignore
/// use connectrpc::client::{Http2Connection, ClientConfig};
/// use connectrpc::Protocol;
///
/// let uri: http::Uri = "http://localhost:8080".parse()?;
/// let conn = Http2Connection::connect_plaintext(uri.clone()).await?.shared(1024);
/// let config = ClientConfig::new(uri).protocol(Protocol::Grpc);
///
/// let client = AiServiceClient::new(conn, config);
/// let response = client.complete(request).await?;
/// ```
///
/// # Example (Connect / HTTP/1.1 or ALPN)
///
/// ```rust,ignore
/// use connectrpc::client::{HttpClient, ClientConfig};
///
/// let http = HttpClient::plaintext();  // cleartext http:// only
/// let config = ClientConfig::new("http://localhost:8080".parse()?);
///
/// let client = AiServiceClient::new(http, config);
/// let response = client.complete(request).await?;
/// ```
///
/// # Working with the response
///
/// Unary calls return [`UnaryResponse<OwnedView<FooView>>`](::connectrpc::client::UnaryResponse).
/// The `OwnedView` derefs to the view, so field access is zero-copy:
///
/// ```rust,ignore
/// let resp = client.complete(request).await?.into_view();
/// let name: &str = resp.name;  // borrow into the response buffer
/// ```
///
/// If you need the owned struct (e.g. to store or pass by value), use
/// [`into_owned()`](::connectrpc::client::UnaryResponse::into_owned):
///
/// ```rust,ignore
/// let owned = client.complete(request).await?.into_owned();
/// ```
#[derive(Clone)]
pub struct AiServiceClient<T> {
    transport: T,
    config: ::connectrpc::client::ClientConfig,
}
impl<T> AiServiceClient<T>
where
    T: ::connectrpc::client::ClientTransport,
    <T::ResponseBody as ::http_body::Body>::Error: ::std::fmt::Display,
{
    /// Create a new client with the given transport and configuration.
    pub fn new(transport: T, config: ::connectrpc::client::ClientConfig) -> Self {
        Self { transport, config }
    }
    /// Get the client configuration.
    pub fn config(&self) -> &::connectrpc::client::ClientConfig {
        &self.config
    }
    /// Get a mutable reference to the client configuration.
    pub fn config_mut(&mut self) -> &mut ::connectrpc::client::ClientConfig {
        &mut self.config
    }
    /// Call the Complete RPC. Sends a request to /kuku.ai.v1.AIService/Complete.
    pub async fn complete(
        &self,
        request: crate::proto::kuku::ai::v1::CompleteRequest,
    ) -> Result<
        ::connectrpc::client::ServerStream<
            T::ResponseBody,
            crate::proto::kuku::ai::v1::CompleteResponseView<'static>,
        >,
        ::connectrpc::ConnectError,
    > {
        self.complete_with_options(request, ::connectrpc::client::CallOptions::default())
            .await
    }
    /// Call the Complete RPC with explicit per-call options. Options override [`connectrpc::client::ClientConfig`] defaults.
    pub async fn complete_with_options(
        &self,
        request: crate::proto::kuku::ai::v1::CompleteRequest,
        options: ::connectrpc::client::CallOptions,
    ) -> Result<
        ::connectrpc::client::ServerStream<
            T::ResponseBody,
            crate::proto::kuku::ai::v1::CompleteResponseView<'static>,
        >,
        ::connectrpc::ConnectError,
    > {
        ::connectrpc::client::call_server_stream(
                &self.transport,
                &self.config,
                AI_SERVICE_SERVICE_NAME,
                "Complete",
                request,
                options,
            )
            .await
    }
}
