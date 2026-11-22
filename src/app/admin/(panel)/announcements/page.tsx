import type { Metadata } from "next";
import { AnnouncementsEditor } from "@/components/admin/announcements-editor";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { getAnnouncements } from "@/features/marketing/announcements";

export const metadata: Metadata = { title: "Top bar messages" };

async function Content() {
  const items = await getAnnouncements();
  return (
    <>
      <PageHeader title="Top Bar Messages" description="The moving purple bar at the very top of the website. Add offers or news; each can link to a page like /offers." />
      <Card className="shadow-card">
        <CardContent>
          <AnnouncementsEditor initial={items} />
        </CardContent>
      </Card>
    </>
  );
}

export default function AnnouncementsPage() {
  return (
    <StaffOnly module="cms">
      <Content />
    </StaffOnly>
  );
}
