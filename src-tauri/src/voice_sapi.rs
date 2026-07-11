//! Windows SAPI command-grammar voice wake (MVP).

use std::sync::mpsc::{self, Receiver, Sender};
use std::thread::{self, JoinHandle};

use crate::config::VoiceSapiConfig;

const ZH_CN_LANGID: u16 = 0x0804;

#[derive(Debug, Clone)]
pub enum VoiceSapiEvent {
    Detected {
        phrase: String,
        confidence: f32,
        exact: bool,
    },
    Heard {
        text: String,
        confidence: f32,
        final_result: bool,
    },
    Trace(String),
    Error(String),
    StateChanged(String),
}

pub struct VoiceSapiHandle {
    stop_tx: Sender<()>,
    pub(crate) event_rx: Receiver<VoiceSapiEvent>,
    thread: Option<JoinHandle<()>>,
}

impl VoiceSapiHandle {
    pub fn try_recv(&self) -> Option<VoiceSapiEvent> {
        self.event_rx.try_recv().ok()
    }
}

impl Drop for VoiceSapiHandle {
    fn drop(&mut self) {
        let _ = self.stop_tx.send(());
        if let Some(thread) = self.thread.take() {
            std::thread::Builder::new()
                .name("voice-sapi-join".into())
                .spawn(move || {
                    let _ = thread.join();
                })
                .ok();
        }
    }
}

pub fn stop_voice_sapi(handle: VoiceSapiHandle) {
    drop(handle);
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use std::time::{Duration, Instant};

    use windows::core::{IUnknown, Interface, HSTRING, PWSTR};
    use windows::Win32::Foundation::{CloseHandle, BOOL, HANDLE, WAIT_OBJECT_0};
    use windows::Win32::Globalization::GetUserDefaultUILanguage;
    use windows::Win32::Media::Speech::{
        ISpGrammarBuilder, ISpRecoContext, ISpRecoGrammar, ISpRecoResult, ISpRecognizer,
        SPRAF_Active, SPRAF_TopLevel, SpInprocRecognizer, SpMMAudioIn, SPEI_FALSE_RECOGNITION,
        SPEI_HYPOTHESIS, SPEI_INTERFERENCE, SPEI_PHRASE_START, SPEI_RECOGNITION, SPEI_SOUND_END,
        SPEI_SOUND_START, SPEI_SR_AUDIO_LEVEL, SPEVENT, SPGRAMMARWORDTYPE, SPGS_ENABLED,
        SPLO_STATIC, SPRST_ACTIVE_ALWAYS, SPRST_INACTIVE, SPRS_ACTIVE, SPRULESTATE, SPSTATEHANDLE,
        SPWT_LEXICAL,
    };
    use windows::Win32::System::Com::COINIT_APARTMENTTHREADED;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    };
    use windows::Win32::System::Threading::WaitForSingleObject;

    fn send_event(tx: &Sender<VoiceSapiEvent>, event: VoiceSapiEvent) {
        let _ = tx.send(event);
    }

    fn com_err(step: &str, e: windows::core::Error) -> String {
        format!("{step}: {e}")
    }

    fn setup_event_notify(context: &ISpRecoContext) -> Result<HANDLE, String> {
        unsafe {
            // SetInterest must come before SetNotifyWin32Event on many systems.
            let interest = (1u64 << (SPEI_RECOGNITION.0 as u32))
                | (1u64 << (SPEI_HYPOTHESIS.0 as u32))
                | (1u64 << (SPEI_SOUND_START.0 as u32))
                | (1u64 << (SPEI_SOUND_END.0 as u32))
                | (1u64 << (SPEI_PHRASE_START.0 as u32))
                | (1u64 << (SPEI_FALSE_RECOGNITION.0 as u32))
                | (1u64 << (SPEI_INTERFERENCE.0 as u32))
                | (1u64 << (SPEI_SR_AUDIO_LEVEL.0 as u32));
            let _ = context.SetInterest(interest, interest);

            context
                .SetNotifyWin32Event()
                .map_err(|e| com_err("SetNotifyWin32Event", e))?;

            let notify = context.GetNotifyEventHandle();
            if notify.is_invalid() {
                return Err("GetNotifyEventHandle returned invalid handle".into());
            }
            Ok(notify)
        }
    }

    fn spevent_id(event: &SPEVENT) -> i32 {
        // windows crate packs eEventId into the low 16 bits of _bitfield.
        event._bitfield & 0xFFFF
    }

    #[allow(dead_code)]
    fn grammar_lang_id() -> u16 {
        let lang = unsafe { GetUserDefaultUILanguage() };
        if lang == 0 {
            ZH_CN_LANGID
        } else {
            lang
        }
    }

    fn normalize_phrase(s: &str) -> String {
        s.chars().filter(|c| c.is_alphanumeric()).collect()
    }

    fn latin_word_tokens(text: &str) -> Vec<String> {
        text.split_whitespace()
            .map(|w| normalize_phrase(w))
            .filter(|w| !w.is_empty())
            .collect()
    }

    fn tokens_in_subsequence_order(haystack: &[String], needle: &[String]) -> bool {
        if needle.is_empty() {
            return false;
        }
        let mut matched = 0;
        for token in haystack {
            if token == &needle[matched] {
                matched += 1;
                if matched >= needle.len() {
                    return true;
                }
            }
        }
        matched >= needle.len()
    }

    fn english_wake_token_match(text: &str, phrase: &str) -> bool {
        let phrase_tokens = latin_word_tokens(phrase);
        if phrase_tokens.len() < 2 {
            return false;
        }
        let text_tokens = latin_word_tokens(text);
        let phrase_norm = normalize_phrase(phrase);
        if tokens_in_subsequence_order(&text_tokens, &phrase_tokens) {
            let joined_norm = normalize_phrase(&text_tokens.join(" "));
            if joined_norm == phrase_norm || normalize_phrase(text) == phrase_norm {
                return true;
            }
            return crate::voice_vosk::wake_fuzzy_match_allowed(text, phrase);
        }
        false
    }

    fn matches_wake_phrase(text: &str, phrases: &[String]) -> Option<(String, bool)> {
        let norm = normalize_phrase(text);
        if norm.is_empty() {
            return None;
        }
        for phrase in phrases {
            let target = normalize_phrase(phrase);
            if target.is_empty() {
                continue;
            }
            if norm == target {
                return Some((phrase.clone(), true));
            }
            if (norm.contains(&target) || target.contains(&norm))
                && crate::voice_vosk::wake_fuzzy_match_allowed(&text, phrase)
            {
                return Some((phrase.clone(), false));
            }
            if english_wake_token_match(text, phrase) {
                return Some((phrase.clone(), norm == target));
            }
        }
        None
    }

    /// Phase 0 spike: verify COM types compile and basic objects can be created.
    #[allow(dead_code)]
    pub fn spike_create_recognizer() -> Result<(), String> {
        unsafe {
            CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                .ok()
                .map_err(|e| com_err("CoInitializeEx", e))?;

            let result = (|| -> Result<(), String> {
                let recognizer: ISpRecognizer =
                    CoCreateInstance(&SpInprocRecognizer, None, CLSCTX_ALL)
                        .map_err(|e| com_err("CoCreateInstance(SpInprocRecognizer)", e))?;
                let audio: IUnknown = CoCreateInstance(&SpMMAudioIn, None, CLSCTX_ALL)
                    .map_err(|e| com_err("CoCreateInstance(SpMMAudioIn)", e))?;
                recognizer
                    .SetInput(&audio, true)
                    .map_err(|e| com_err("SetInput(SpMMAudioIn)", e))?;
                let context = recognizer
                    .CreateRecoContext()
                    .map_err(|e| com_err("CreateRecoContext", e))?;
                let _grammar = context
                    .CreateGrammar(1)
                    .map_err(|e| com_err("CreateGrammar", e))?;
                Ok(())
            })();

            CoUninitialize();
            result
        }
    }

    #[allow(dead_code)]
    fn wide(s: &str) -> HSTRING {
        HSTRING::from(s)
    }

    #[allow(dead_code)]
    fn build_programmatic_grammar(
        grammar: &ISpRecoGrammar,
        phrases: &[String],
    ) -> Result<(), String> {
        let builder: ISpGrammarBuilder = grammar
            .cast()
            .map_err(|e| com_err("cast ISpGrammarBuilder", e))?;

        unsafe {
            let lang = grammar_lang_id();
            builder
                .ResetGrammar(lang)
                .map_err(|e| com_err(&format!("ResetGrammar({lang:#x})"), e))?;

            let mut rule_state = std::mem::zeroed();
            let attrs = (SPRAF_TopLevel.0 | SPRAF_Active.0) as u32;
            builder
                .GetRule(&wide("wake"), 0, attrs, true, &mut rule_state)
                .map_err(|e| com_err("GetRule(wake)", e))?;

            for phrase in phrases {
                let phrase = phrase.trim();
                if phrase.is_empty() {
                    continue;
                }
                builder
                    .AddWordTransition(
                        rule_state,
                        SPSTATEHANDLE::default(),
                        &wide(phrase),
                        &wide(" "),
                        SPGRAMMARWORDTYPE(SPWT_LEXICAL.0),
                        1.0,
                        std::ptr::null(),
                    )
                    .map_err(|e| com_err(&format!("AddWordTransition({phrase})"), e))?;
            }

            grammar
                .Commit(0)
                .map_err(|e| com_err("Commit grammar", e))?;
        }

        Ok(())
    }

    /// Dictation + phrase match is more reliable for Chinese wake phrases on many systems.
    fn load_dictation_grammar(grammar: &ISpRecoGrammar) -> Result<(), String> {
        unsafe {
            grammar
                .LoadDictation(None, SPLO_STATIC)
                .map_err(|e| com_err("LoadDictation", e))?;
            grammar
                .SetDictationState(SPRS_ACTIVE)
                .map_err(|e| com_err("SetDictationState(ACTIVE)", e))?;
        }
        Ok(())
    }

    fn load_wake_grammar(grammar: &ISpRecoGrammar, _phrases: &[String]) -> Result<(), String> {
        // Dictation + phrase match works more reliably for Chinese wake words than strict CFG.
        load_dictation_grammar(grammar)
    }

    fn phrase_from_result(result: &ISpRecoResult) -> Result<(String, f32), String> {
        unsafe {
            let mut text_ptr = PWSTR::null();
            result
                .GetText(0, u32::MAX, BOOL::from(true), &mut text_ptr, None)
                .map_err(|e| com_err("GetText", e))?;

            let phrase = if text_ptr.is_null() {
                String::new()
            } else {
                let len = (0..).take_while(|&i| *text_ptr.0.add(i) != 0).count();
                let s = String::from_utf16_lossy(std::slice::from_raw_parts(text_ptr.0, len));
                CoTaskMemFree(Some(text_ptr.0 as *const c_void));
                s
            };

            let confidence = result_confidence(result).unwrap_or(1.0).max(0.0);
            Ok((phrase.trim().to_string(), confidence))
        }
    }

    fn handle_recognition_event(
        event: &SPEVENT,
        phrases: &[String],
        event_tx: &Sender<VoiceSapiEvent>,
    ) {
        let id = spevent_id(event);
        if id != SPEI_RECOGNITION.0 && id != SPEI_HYPOTHESIS.0 {
            return;
        }
        if event.lParam.0 == 0 {
            return;
        }
        unsafe {
            let result = ISpRecoResult::from_raw(event.lParam.0 as *mut c_void);
            match phrase_from_result(&result) {
                Ok((text, confidence)) if !text.is_empty() => {
                    let final_result = id == SPEI_RECOGNITION.0;
                    send_event(
                        event_tx,
                        VoiceSapiEvent::Heard {
                            text: text.clone(),
                            confidence,
                            final_result,
                        },
                    );
                    if let Some((matched, exact)) = matches_wake_phrase(&text, phrases) {
                        send_event(
                            event_tx,
                            VoiceSapiEvent::Detected {
                                phrase: matched,
                                confidence: if final_result { confidence } else { 0.75 },
                                exact,
                            },
                        );
                    } else if final_result {
                        if let Some(reason) =
                            crate::voice_vosk::wake_text_rejection_reason(&text, phrases)
                        {
                            send_event(
                                event_tx,
                                VoiceSapiEvent::Trace(reason),
                            );
                        } else {
                            let targets = phrases.join("、");
                            send_event(
                                event_tx,
                                VoiceSapiEvent::Trace(format!(
                                    "听到「{text}」，和你要说的「{targets}」不一样"
                                )),
                            );
                        }
                    }
                }
                Ok(_) => {}
                Err(e) => send_event(event_tx, VoiceSapiEvent::Error(e)),
            }
        }
    }

    fn result_confidence(result: &ISpRecoResult) -> Option<f32> {
        unsafe {
            let phrase_ptr = result.GetPhrase().ok()?;
            if phrase_ptr.is_null() {
                return None;
            }
            let conf = (*phrase_ptr).Base.Rule.SREngineConfidence;
            CoTaskMemFree(Some(phrase_ptr as *const c_void));
            Some(conf)
        }
    }

    fn worker(config: VoiceSapiConfig, stop_rx: Receiver<()>, event_tx: Sender<VoiceSapiEvent>) {
        let run = || -> Result<(), String> {
            let phrases: Vec<String> = if config.phrases.iter().any(|p| !p.trim().is_empty()) {
                config
                    .phrases
                    .iter()
                    .map(|p| p.trim().to_string())
                    .filter(|p| !p.is_empty())
                    .collect()
            } else {
                vec!["开始输入".into()]
            };

            unsafe {
                CoInitializeEx(None, COINIT_APARTMENTTHREADED)
                    .ok()
                    .map_err(|e| com_err("CoInitializeEx", e))?;

                let recognizer: ISpRecognizer =
                    CoCreateInstance(&SpInprocRecognizer, None, CLSCTX_ALL).map_err(|e| {
                        com_err(
                            "CoCreateInstance(SpInprocRecognizer) — install Windows speech / Chinese language pack",
                            e,
                        )
                    })?;
                let audio: IUnknown = CoCreateInstance(&SpMMAudioIn, None, CLSCTX_ALL)
                    .map_err(|e| com_err("CoCreateInstance(SpMMAudioIn)", e))?;
                recognizer
                    .SetInput(&audio, true)
                    .map_err(|e| com_err("SetInput(SpMMAudioIn)", e))?;

                let context: ISpRecoContext = recognizer
                    .CreateRecoContext()
                    .map_err(|e| com_err("CreateRecoContext", e))?;

                let grammar = context
                    .CreateGrammar(1)
                    .map_err(|e| com_err("CreateGrammar", e))?;

                load_wake_grammar(&grammar, &phrases)?;

                grammar
                    .SetGrammarState(SPGS_ENABLED)
                    .map_err(|e| com_err("SetGrammarState(ENABLED)", e))?;

                let notify = setup_event_notify(&context)?;

                recognizer
                    .SetRecoState(SPRST_ACTIVE_ALWAYS)
                    .map_err(|e| com_err("SetRecoState(ACTIVE_ALWAYS)", e))?;

                send_event(&event_tx, VoiceSapiEvent::StateChanged("listening".into()));

                loop {
                    if stop_rx.try_recv().is_ok() {
                        break;
                    }

                    let wait = WaitForSingleObject(notify, 30);
                    if wait != WAIT_OBJECT_0 && wait.0 != 258 {
                        continue;
                    }

                    let mut events = [SPEVENT::default(); 8];
                    let mut fetched = 0u32;
                    if context
                        .GetEvents(8, events.as_mut_ptr(), &mut fetched)
                        .is_err()
                    {
                        continue;
                    }

                    for event in &events[..fetched as usize] {
                        handle_recognition_event(event, &phrases, &event_tx);
                    }
                }

                let _ = grammar.SetRuleState(None, std::ptr::null_mut(), SPRULESTATE(0));
                let _ = recognizer.SetRecoState(SPRST_INACTIVE);
                let _ = CloseHandle(notify);
                CoUninitialize();
            }

            Ok(())
        };

        match run() {
            Ok(()) => send_event(&event_tx, VoiceSapiEvent::StateChanged("stopped".into())),
            Err(e) => {
                send_event(&event_tx, VoiceSapiEvent::Error(e.clone()));
                send_event(&event_tx, VoiceSapiEvent::StateChanged("error".into()));
            }
        }
    }

    pub fn start_voice_sapi(config: VoiceSapiConfig) -> Result<VoiceSapiHandle, String> {
        let (event_tx, event_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();

        let cfg = config.clone();
        let thread = thread::Builder::new()
            .name("voice-sapi".into())
            .spawn(move || worker(cfg, stop_rx, event_tx))
            .map_err(|e| format!("spawn voice-sapi thread: {e}"))?;

        let deadline = Instant::now() + Duration::from_millis(400);
        loop {
            while let Ok(ev) = event_rx.try_recv() {
                match ev {
                    VoiceSapiEvent::Error(e) => {
                        let handle = VoiceSapiHandle {
                            stop_tx,
                            event_rx,
                            thread: Some(thread),
                        };
                        stop_voice_sapi(handle);
                        return Err(e);
                    }
                    VoiceSapiEvent::StateChanged(s) if s == "listening" => {
                        return Ok(VoiceSapiHandle {
                            stop_tx,
                            event_rx,
                            thread: Some(thread),
                        });
                    }
                    _ => {}
                }
            }
            if Instant::now() >= deadline {
                return Ok(VoiceSapiHandle {
                    stop_tx,
                    event_rx,
                    thread: Some(thread),
                });
            }
            thread::sleep(Duration::from_millis(20));
        }
    }
}

#[cfg(windows)]
pub use imp::start_voice_sapi;

#[cfg(not(windows))]
pub fn start_voice_sapi(_config: VoiceSapiConfig) -> Result<VoiceSapiHandle, String> {
    Err("SAPI voice wake is Windows-only".into())
}

#[cfg(not(windows))]
pub fn spike_create_recognizer() -> Result<(), String> {
    Err("SAPI voice wake is Windows-only".into())
}

#[cfg(all(test, windows))]
mod tests {
    use super::imp::spike_create_recognizer;

    #[test]
    #[ignore = "requires Windows SAPI COM"]
    fn spike_create_recognizer_ok() {
        spike_create_recognizer().expect("SAPI COM spike");
    }
}
