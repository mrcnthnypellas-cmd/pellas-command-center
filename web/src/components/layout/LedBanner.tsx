import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

interface BannerData {
  banner_enabled: boolean;
  banner_text: string;
  banner_text_color: string;
  banner_bg_color: string;
  banner_font_size_px: number;
  banner_speed_seconds: number;
}

export function useBanner() {
  const [banner, setBanner] = useState<BannerData | null>(null);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      const { data } = await supabase
        .from("companies")
        .select("id, banner_enabled, banner_text, banner_text_color, banner_bg_color, banner_font_size_px, banner_speed_seconds")
        .limit(1)
        .maybeSingle();
      if (!data) return;
      setBanner(data as unknown as BannerData);

      channel = supabase
        .channel(`banner-${data.id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "companies", filter: `id=eq.${data.id}` }, (payload) => {
          setBanner(payload.new as unknown as BannerData);
        })
        .subscribe();
    }
    load();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return banner;
}

export default function LedBanner({ banner }: { banner: BannerData | null }) {
  if (!banner || !banner.banner_enabled || !banner.banner_text.trim()) return null;

  return (
    <div
      className="w-full overflow-hidden whitespace-nowrap"
      style={{ backgroundColor: banner.banner_bg_color }}
    >
      <div
        className="inline-block py-1.5 font-bold tracking-wide"
        style={{
          color: banner.banner_text_color,
          fontSize: `${banner.banner_font_size_px}px`,
          animation: `led-scroll ${Math.max(3, banner.banner_speed_seconds || 20)}s linear infinite`,
          paddingLeft: "100%",
        }}
      >
        {banner.banner_text}
      </div>
      <style>{`
        @keyframes led-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
    </div>
  );
}
