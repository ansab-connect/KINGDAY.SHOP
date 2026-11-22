import type { Metadata } from "next";
import { InstagramEditor } from "@/components/admin/instagram-editor";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { getInstagramPosts, INSTAGRAM_URL } from "@/features/marketing/instagram";

export const metadata: Metadata = { title: "Royal Moments (Instagram)" };

async function Content() {
  const posts = await getInstagramPosts();
  return (
    <>
      <PageHeader
        title="Royal Moments"
        description="The Instagram gallery on the homepage. Add real posts from @kingday.official: paste the post or reel link. The homepage plays the real Instagram video, so no picture is needed."
      />
      <p className="mb-4 text-sm text-muted-foreground">
        Open{" "}
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-royal hover:underline">
          instagram.com/kingday.official
        </a>
        , open a post or reel, tap ⋯ → Copy link, and paste it here. A picture is optional.
      </p>
      <Card className="shadow-card">
        <CardContent>
          <InstagramEditor initial={posts} />
        </CardContent>
      </Card>
    </>
  );
}

export default function InstagramPage() {
  return (
    <StaffOnly module="cms">
      <Content />
    </StaffOnly>
  );
}
