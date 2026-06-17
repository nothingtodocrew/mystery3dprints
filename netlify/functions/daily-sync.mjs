// Mystery3DPrints — Daily Printables Sync
// Scheduled to run every night at midnight UTC
// Pulls 20 models per category from Printables → saves to Supabase

const SUPABASE_URL = "https://kmlemcoibfiziuiockfn.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PRINTABLES_API = "https://api.printables.com/graphql/";

const CATEGORIES = [
  { id: "home",       printablesId: "3"  },
  { id: "gaming",     printablesId: "28" },
  { id: "nature",     printablesId: "4"  },
  { id: "tools",      printablesId: "7"  },
  { id: "art",        printablesId: "1"  },
  { id: "scifi",      printablesId: "29" },
  { id: "miniatures", printablesId: "30" },
  { id: "gifts",      printablesId: "25" },
  { id: "random",     printablesId: null },
];

const QUERY = `
  query GetModels($categoryId: ID, $limit: Int!) {
    prints(limit: $limit, categoryId: $categoryId, ordering: "-likes_count") {
      items {
        id
        name
        summary
        image { filePath }
        user { publicUsername }
      }
    }
  }
`;

const TRENDING_QUERY = `
  query GetTrending($limit: Int!) {
    prints(limit: $limit, ordering: "-likes_count") {
      items {
        id
        name
        summary
        image { filePath }
        user { publicUsername }
      }
    }
  }
`;

const fetchCategory = async (cat) => {
  try {
    const query = cat.printablesId ? QUERY : TRENDING_QUERY;
    const variables = cat.printablesId
      ? { categoryId: cat.printablesId, limit: 20 }
      : { limit: 20 };

    const res = await fetch(PRINTABLES_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mystery3DPrints/1.0" },
      body: JSON.stringify({ query, variables })
    });

    const data = await res.json();
    console.log(`Raw response for ${cat.id}:`, JSON.stringify(data).slice(0, 500));

    if (data.errors) {
      console.error(`GraphQL errors for ${cat.id}:`, JSON.stringify(data.errors));
      return [];
    }

    const items = data?.data?.prints?.items || [];
    const today = new Date().toISOString().split("T")[0];

    return items.map(item => ({
      category: cat.id,
      name: item.name || "Unknown Model",
      description: item.summary || "",
      image_url: item.image?.filePath
        ? `https://media.printables.com/${item.image.filePath}`
        : "",
      makerworld_link: `https://www.printables.com/model/${item.id}`,
      fetched_date: today,
    }));
  } catch (err) {
    console.error(`Failed ${cat.id}:`, err.message);
    return [];
  }
};

const syncToSupabase = async (models) => {
  const today = new Date().toISOString().split("T")[0];
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };

  await fetch(`${SUPABASE_URL}/rest/v1/daily_models?fetched_date=eq.${today}`, {
    method: "DELETE", headers
  });

  if (!models.length) return 0;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/daily_models`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(models)
  });

  if (!res.ok) throw new Error(await res.text());
  return models.length;
};

export const handler = async () => {
  try {
    console.log("Starting nightly sync...");
    const results = await Promise.all(CATEGORIES.map(fetchCategory));
    const all = results.flat();
    const count = await syncToSupabase(all);
    console.log(`Sync complete: ${count} models`);
    return { statusCode: 200, body: JSON.stringify({ success: true, count }) };
  } catch (err) {
    console.error("Sync failed:", err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
