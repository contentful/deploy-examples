import lunr from "lunr";
import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs/promises";
import { documentToPlainTextString } from "@contentful/rich-text-plain-text-renderer";
import dotenv from "dotenv-flow";

dotenv.config();

import { buildSearchIndex } from "../../lib/search";
import { getSingleArticleBySlug } from "../../lib/api";

const truncateContent = async (found: lunr.Index.Result) => {
  const key = Object.keys(found.matchData?.metadata).find((key) => {
    // console.log(found.matchData.metadata[key]);
    return found.matchData.metadata[key].content?.position;
  });

  const articleSlug = found.ref;
  const contentfulResult = await getSingleArticleBySlug(articleSlug);
  const text = documentToPlainTextString(contentfulResult.body.json);

  if (!key) return text;

  const [index, length] = found.matchData.metadata[key].content.position[0];
  const startIndex = Math.max(0, index - 15);
  const truncatedContent = text.slice(startIndex, startIndex + length + 50);
  let content;

  if (startIndex + length + 50 < text.length) {
    content = `${truncatedContent}…`;
  }

  if (startIndex > 0) {
    content = `…${content}`;
  }

  return {
    content,
    title: contentfulResult.title,
    slug: `/${contentfulResult.kbAppCategory.slug}/${contentfulResult.slug}`,
  };
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { query } = JSON.parse(req.body);
  let indexToLoad: lunr.Index;

  try {
    const serializedIndex = await fs.readFile("searchIndex.json", {
      encoding: "utf-8",
    });
    indexToLoad = JSON.parse(serializedIndex);
  } catch (error) {
    // Recreate index
    indexToLoad = await buildSearchIndex();
    const serializedIndex = JSON.stringify(indexToLoad);

    await fs.writeFile("searchIndex.json", serializedIndex, {
      encoding: "utf-8",
    });
  }

  const index = lunr.Index.load(indexToLoad);
  const found = index.search(`${query}*`);
  let matches: any[] = [];

  for (const result of found) {
    const match = await truncateContent(result);
    matches = [...matches, match];
  }

  res.status(200).json(matches);
}
