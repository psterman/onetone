//! Optional input extensions (generic HID vendor page, XInput, …).
//! Wired into [`crate::hotkey_win`] dispatch via polling on the hotkey thread.

pub trait InputSource: Send {
    fn name(&self) -> &'static str;

    /// Poll for newly pressed logical key names (same namespace as keyboard hooks).
    fn poll(&mut self) -> Vec<String> {
        Vec::new()
    }
}

pub struct InputExtensionBus {
    sources: Vec<Box<dyn InputSource>>,
}

impl InputExtensionBus {
    pub fn new() -> Self {
        Self {
            sources: Vec::new(),
        }
    }

    #[cfg(windows)]
    pub fn with_defaults() -> Self {
        let mut bus = Self::new();
        bus.register(Box::new(crate::xinput_win::XInputSource::new()));
        bus
    }

    #[cfg(not(windows))]
    pub fn with_defaults() -> Self {
        Self::new()
    }

    pub fn register(&mut self, source: Box<dyn InputSource>) {
        self.sources.push(source);
    }

    pub fn poll_all(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        for source in &mut self.sources {
            out.extend(source.poll());
        }
        out
    }
}

impl Default for InputExtensionBus {
    fn default() -> Self {
        Self::with_defaults()
    }
}
