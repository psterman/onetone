import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// P1: React Islands 构建配置。
// 只构建 src-islands 入口，输出到 src/assets/islands/，不动 legacy src/。
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'src/assets/islands',
    // false: 避免 Vite 清空输出目录时调用环境里的「安全删除」垃圾箱二进制（该二进制在本沙箱会挂起）。
    // 产物直接覆盖写入；CI 中如需干净输出可手动 rm 该目录。
    emptyOutDir: false,
    lib: {
      entry: 'src-islands/main.tsx',
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'main.js',
        chunkFileNames: '[name].js',
      },
    },
  },
});
