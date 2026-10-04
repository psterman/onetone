/// <reference types="vite/client" />

interface Window {
  chrome?: {
    webview?: {
      addEventListener?: (type: string, listener: (event: MessageEvent) => void) => void;
      removeEventListener?: (type: string, listener: (event: MessageEvent) => void) => void;
      postMessage?: (message: unknown) => void;
    };
  };
}

declare module '*.css?inline' {
  const content: string;
  export default content;
}
