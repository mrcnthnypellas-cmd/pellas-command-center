import { fontFamilyCss } from '@/lib/theme';

export function LedBanner({
  message,
  textColor,
  backgroundColor,
  fontFamily,
  speedSeconds,
  height,
}: {
  message: string;
  textColor: string;
  backgroundColor: string;
  fontFamily: string | null;
  speedSeconds: number;
  height: number;
}) {
  return (
    <div
      className="relative w-full shrink-0 overflow-hidden"
      style={{ backgroundColor, height }}
    >
      <div
        className="led-banner-scroll absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
        style={{
          color: textColor,
          fontFamily: fontFamilyCss(fontFamily),
          animationDuration: `${speedSeconds}s`,
        }}
      >
        <span className="px-8 text-sm font-semibold tracking-wide">{message}</span>
        <span className="px-8 text-sm font-semibold tracking-wide" aria-hidden="true">
          {message}
        </span>
      </div>
    </div>
  );
}
