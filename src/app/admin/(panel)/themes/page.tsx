import type { Metadata } from "next";
import { HeroThemesEditor } from "@/components/admin/hero-themes-editor";
import { PageHeader } from "@/components/admin/page-header";
import { StaffOnly } from "@/components/admin/staff-only";
import { Card, CardContent } from "@/components/ui/card";
import { getHeroThemes } from "@/features/marketing/hero-themes";

export const metadata: Metadata = { title: "Seasonal Themes" };

async function Content() {
  const value = await getHeroThemes();
  return (
    <>
      <PageHeader
        title="Seasonal Themes"
        description="The animated homepage hero. Each theme has its own dates, colours, decorations, character costume and 3–4 scenes. King, Mia and customers' characters appear in every theme."
      />
      <Card className="shadow-card">
        <CardContent>
          <HeroThemesEditor initial={value} />
        </CardContent>
      </Card>
    </>
  );
}

export default function ThemesPage() {
  return (
    <StaffOnly module="cms">
      <Content />
    </StaffOnly>
  );
}
