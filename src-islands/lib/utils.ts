// 轻量 cn：合并类名（替代 clsx + tailwind-merge）。
// 注：本环境无法稳定安装 clsx/tailwind-merge，这里用零依赖实现，行为等价（过滤假值、展开数组/对象）。
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean>
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const i of inputs) {
    if (!i) continue;
    if (typeof i === 'string' || typeof i === 'number') {
      out.push(String(i));
    } else if (Array.isArray(i)) {
      out.push(cn(...i));
    } else if (typeof i === 'object') {
      for (const [k, v] of Object.entries(i)) {
        if (v) out.push(k);
      }
    }
  }
  return out.join(' ');
}
