import Link from "next/link";
import { Wrench } from "lucide-react";
import { L } from "@/components/i18n/lang";
import { getAnnouncements, type Announcement } from "@/features/marketing/announcements";

/**
 * The moving bar at the top of the store. Messages come from Admin → Top Bar Messages.
 * Scrolls in a loop, pauses on hover/touch, and stands still for "reduce motion".
 */
export async function AnnouncementBar() {
  const items = await getAnnouncements();
  return <AnnouncementBarView items={items} />;
}

export function AnnouncementBarView({ items }: { items: Announcement[] }) {
  if (!items.length) return null;
  // Repeat the list so the loop is seamless on wide screens too.
  const loop = items.length < 4 ? [...items, ...items, ...items] : items;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {loop.map((a, i) => (
        <li key={i} className="flex items-center whitespace-nowrap">
          {a.href ? (
            a.href.startsWith("/") ? (
              <Link href={a.href} tabIndex={hidden ? -1 : undefined} className="px-5 hover:text-gold hover:underline">{a.text}</Link>
            ) : (
              <a href={a.href} target="_blank" rel="noopener noreferrer" tabIndex={hidden ? -1 : undefined} className="px-5 hover:text-gold hover:underline">{a.text}</a>
            )
          ) : (
            <span className="px-5">{a.text}</span>
          )}
          <span aria-hidden className="text-gold">✦</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="bg-royal text-white">
      <div className="mx-auto flex h-9 max-w-7xl items-center gap-3 text-[0.72rem] font-medium sm:text-xs lg:h-11 lg:px-8 lg:text-sm">
        <div className="kd-marquee relative min-w-0 flex-1 overflow-hidden" aria-label="Store announcements">
          <div className="kd-marquee-track flex w-max">
            {row(false)}
            {row(true)}
          </div>
        </div>
        <a href="/book-service" className="mr-4 hidden shrink-0 items-center gap-1.5 rounded-full bg-gold px-4 py-1 font-semibold text-deep hover:bg-gold-300 lg:mr-0 lg:inline-flex">
          <Wrench aria-hidden className="size-3.5" /> <L en="Book a Service" ml="സർവീസ് ബുക്ക് ചെയ്യുക" />
        </a>
      </div>
    </div>
  );
}
