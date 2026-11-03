// writer/plan.html §3：升级请求按路径分流；/audio 与 /media 平级，控制通道不受影响。
export type UpgradeTarget = 'media' | 'audio' | 'control';

export function resolveUpgradeTarget(url: string): UpgradeTarget {
  const path = url.split('?')[0] ?? '';
  if (path === '/media') return 'media';
  if (path === '/audio') return 'audio';
  return 'control';
}
