use baresync_core::db::{DatabaseKey, EncryptionKeyContext, EncryptionKeyProvider};
use tauri_plugin_baresync::builder::Builder;

#[derive(Clone, Default)]
struct TestKeyProvider;

impl EncryptionKeyProvider for TestKeyProvider {
    fn encryption_key(
        &self,
        _context: EncryptionKeyContext,
    ) -> Result<DatabaseKey, Box<dyn std::error::Error + Send + Sync>> {
        DatabaseKey::try_from(vec![0x11; 32]).map_err(|error| error.into())
    }
}

#[test]
fn builder_accepts_encryption_key_provider() {
    let builder = Builder::new().encryption_key_provider(TestKeyProvider);

    let _ = builder;
}
