export type Museum = {
  id: string;
  museumName: string;
  address: string;
  image: string;
};

export type Collection = {
  id: string;
  name: string;
  artworks: {
    id: string;
    title: string;
    images: string[];
  }[];
};

const BASE = process.env.EXPO_PUBLIC_API_URL;

export const fetchMuseums = async ({ query }: { query: string }) => {
  const endpoint = `${BASE}/api/museums${
    query ? `?q=${encodeURIComponent(query)}` : ""
  }`;
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Failed to fetch museums: ${res.status}`);
  const data: Museum[] = await res.json();
  return data;
};

export const fetchCollections = async (museumId: string) => {
  if (!museumId) throw new Error("museumId is required");

  const endpoint = `${BASE}/api/museums/${museumId}/collections`;

  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`Failed to fetch collections: ${res.status}`);
  const data: Collection[] = await res.json();
  return data;
};
