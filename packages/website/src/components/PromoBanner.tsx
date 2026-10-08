import { useCommerceLayer } from "@commercelayer/react-components";
import type React from "react";
import { useEffect, useState } from "react";
import { createClient, defineQuery } from "next-sanity";

type Props = {
  sku: string;
  locale?: "en" | "it"; // optional, default "en"
};

const FREE_GIFT_BANNER_QUERY = defineQuery(`
  *[_type == "promomessage" && code == $code][0]{
    "message": coalesce(
      localizedMessage[_key == $locale][0].value,
      localizedMessage[_key == "en"][0].value
    )
  }
`);

// Only build the client when a projectId is configured. Creating it at module
// load with an empty projectId throws ("Configuration must contain projectId")
// and crashes `next build` during page-data collection.
const sanityProjectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
const sanityClient = sanityProjectId
  ? createClient({
      projectId: sanityProjectId,
      dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
      apiVersion: "2023-06-01",
      useCdn: true,
    })
  : null;

export const PromoMessage: React.FC<Props> = ({ sku, locale = "en" }) => {
  const { sdkClient } = useCommerceLayer();

  const [isEligibleForFreeGift, setIsEligibleForFreeGift] = useState(false);
  const [bannerText, setBannerText] = useState<string | null>(null);

  // 1) Check tag in Commerce Layer
  useEffect(() => {
    const client = sdkClient();
    if (!client || !sku) return;

    client.skus
      .list({
        filters: { code_eq: sku },
        include: ["tags"],
      })
      .then((skus) => {
        const tags = skus?.[0]?.tags ?? [];
        setIsEligibleForFreeGift(tags.some((t) => t.name === "free_gift_eligible"));
      })
      .catch((e) => {
        console.error("CL sku/tags fetch failed:", e);
        setIsEligibleForFreeGift(false);
      });
  }, [sdkClient, sku]);

  // 2) Fetch message from Sanity only if eligible
  useEffect(() => {
    if (!isEligibleForFreeGift || !sanityClient) {
      setBannerText(null);
      return;
    }

    sanityClient
      .fetch<{ message?: string | null }>(FREE_GIFT_BANNER_QUERY, {
        code: "free_gift_eligible",
        locale,
      })
      .then((result) => {
        setBannerText(result?.message ?? null);
      })
      .catch((e) => {
        console.error("Sanity promo message fetch failed:", e);
        setBannerText(null);
      });
  }, [isEligibleForFreeGift, locale]);

  if (!isEligibleForFreeGift || !bannerText) return null;

  return <button className={`my-2 mr-2 rounded py-2 px-4 bg-black text-white`}>{bannerText}</button>;
};