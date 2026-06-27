//! Undocumented IPolicyConfig COM bindings for switching default audio endpoints.

#![allow(non_snake_case, non_camel_case_types, clippy::missing_safety_doc)]

use std::ffi::c_void;
use windows::core::{Interface, IUnknown, Param, Result, GUID, HRESULT, PCWSTR, PROPVARIANT};
use windows::Win32::Media::Audio::{ERole, WAVEFORMATEX};
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;

pub const POLICY_CONFIG_CLIENT: GUID = GUID::from_u128(0x870af99c_171d_4f9e_af0d_e63df40c2bc9);

#[repr(C)]
#[derive(Clone, Copy)]
pub(crate) struct DeviceShareMode {
    mode: i32,
}

#[repr(transparent)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IPolicyConfig(IUnknown);

impl IPolicyConfig {
    pub unsafe fn SetDefaultEndpoint(
        &self,
        device_id: impl Param<PCWSTR>,
        role: ERole,
    ) -> Result<()> {
        (Interface::vtable(self).SetDefaultEndpoint)(
            Interface::as_raw(self),
            device_id.param().abi(),
            role,
        )
        .ok()
    }
}

unsafe impl Interface for IPolicyConfig {
    type Vtable = IPolicyConfig_Vtbl;
    const IID: GUID = GUID::from_u128(0xf8679f50_850a_41cf_9c72_430f290290c8);
}

#[repr(C)]
#[allow(non_snake_case)]
pub struct IPolicyConfig_Vtbl {
    pub base__: windows::core::IUnknown_Vtbl,
    pub GetMixFormat:
        unsafe extern "system" fn(*mut c_void, PCWSTR, *mut *mut WAVEFORMATEX) -> HRESULT,
    pub GetDeviceFormat:
        unsafe extern "system" fn(*mut c_void, PCWSTR, i32, *mut *mut WAVEFORMATEX) -> HRESULT,
    pub ResetDeviceFormat: unsafe extern "system" fn(*mut c_void, PCWSTR) -> HRESULT,
    pub SetDeviceFormat: unsafe extern "system" fn(
        *mut c_void,
        PCWSTR,
        *mut WAVEFORMATEX,
        *mut WAVEFORMATEX,
    ) -> HRESULT,
    pub GetProcessingPeriod:
        unsafe extern "system" fn(*mut c_void, PCWSTR, i32, *mut i64, *mut i64) -> HRESULT,
    pub SetProcessingPeriod: unsafe extern "system" fn(*mut c_void, PCWSTR, *mut i64) -> HRESULT,
    pub GetShareMode:
        unsafe extern "system" fn(*mut c_void, PCWSTR, *mut DeviceShareMode) -> HRESULT,
    pub SetShareMode:
        unsafe extern "system" fn(*mut c_void, PCWSTR, *mut DeviceShareMode) -> HRESULT,
    pub GetPropertyValue: unsafe extern "system" fn(
        *mut c_void,
        PCWSTR,
        i32,
        *const PROPERTYKEY,
        *mut PROPVARIANT,
    ) -> HRESULT,
    pub SetPropertyValue: unsafe extern "system" fn(
        *mut c_void,
        PCWSTR,
        i32,
        *const PROPERTYKEY,
        *mut PROPVARIANT,
    ) -> HRESULT,
    pub SetDefaultEndpoint: unsafe extern "system" fn(*mut c_void, PCWSTR, ERole) -> HRESULT,
    pub SetEndpointVisibility: unsafe extern "system" fn(*mut c_void, PCWSTR, i32) -> HRESULT,
}
