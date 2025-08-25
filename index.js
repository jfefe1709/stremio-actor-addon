const express = require("express");
const axios = require("axios");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "f4273ae35c295c6dd7cd5f05e4e535d8";
const TMDB = "https://api.themoviedb.org/3";

const manifest = {
  id: "org.jfefe1709.actorfilmography",
  name: "Filmografía por Persona",
  version: "1.0.0",
  description: "Busca un actor o director y muestra su filmografía separada en Películas y Series, ordenadas por puntuación.",
  resources: ["catalog", "meta", "stream"],
  types: ["movie", "series"],
  idPrefixes: ["tmdb"],
  catalogs: [
    { type: "movie", id: "people-filmography", name: "Películas" },
    { type: "series", id: "people-filmography", name: "Series" }
  ]
};

const app = express();

/* ================= HELPERS ================= */

async function tmdb(path, params = {}) {
  const { data } = await axios.get(`${TMDB}${path}`, {
    params: { api_key: TMDB_API_KEY, language: "es-ES", ...params }
  });
  return data;
}

async function searchPerson(query) {
  const data = await tmdb("/search/person", { query });
  const sorted = (data.results || []).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return sorted[0] || null;
}

async function getFilmography(personId) {
  const data = await tmdb(`/person/${personId}/combined_credits`);
  const all = [...(data.cast || []), ...(data.crew || [])];

  const movies = all.filter(c => c.media_type === "movie");
  const tv = all.filter(c => c.media_type === "tv");

  return { movies, tv };
}

function mapToMetaItem(type, item) {
  const title = item.title || item.name || "Sin nombre";
  const year = (item.release_date || item.first_air_date || "").slice(0, 4);
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null;
  const score = typeof item.vote_average === "number" ? item.vote_average : 0;

  return {
    id: `tmdb:${type}:${item.id}`,
    type,
    name: title,
    poster,
    posterShape: "poster",
    description: year || "Sin año",
    score
  };
}

async function getFullDetails(type, tmdbId) {
  const path = type === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`;
  const data = await tmdb(path, { append_to_response: "videos" });

  const name = data.title || data.name || "Sin nombre";
  const year = (data.release_date || data.first_air_date || "").slice(0, 4);
  const poster = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null;
  const background = data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null;
  const trailer = (data.videos?.results || []).find(v => v.site === "YouTube" && v.type === "Trailer");

  return {
    id: `tmdb:${type}:${tmdbId}`,
    type,
    name,
    releaseInfo: year || "",
    description: data.overview || "Sin descripción",
    poster,
    background,
    genres: (data.genres || []).map(g => g.name),
    videos: trailer ? [{ id: `yt:${trailer.key}`, title: "Trailer", url: `https://www.youtube.com/watch?v=${trailer.key}` }] : [],
    imdbRating: typeof data.vote_average === "number" ? data.vote_average.toFixed(1) : undefined
  };
}

/* ================= ENDPOINTS STREMIO ================= */

// manifest
app.get("/manifest.json", (_req, res) => res.json(manifest));

// catalog
app.get("/catalog/:type/:id", async (req, res) => {
  try {
    const { type } = req.params; // "movie" o "series"
    const { search } = req.query;
    if (!search || !search.trim()) return res.json({ metas: [] });

    const person = await searchPerson(search.trim());
    if (!person) return res.json({ metas: [] });

    const { movies, tv } = await getFilmography(person.id);
    const pool = type === "movie" ? movies : tv;

    const metas = pool
      .map(item => mapToMetaItem(type, item))
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 100);

    res.json({ metas });
  } catch (err) {
    console.error("CATALOG ERROR:", err?.response?.data || err.message);
    res.json({ metas: [] });
  }
});

// meta
app.get("/meta/:type/:id", async (req, res) => {
  try {
    const { type } = req.params;
    const rawId = req.params.id;
    const parts = rawId.split(":");
    const tmdbId = parts.length === 3 ? parts[2] : rawId;

    const meta = await getFullDetails(type, tmdbId);
    res.json({ meta });
  } catch (err) {
    console.error("META ERROR:", err?.response?.data || err.message);
    res.json({ meta: {} });
  }
});

// stream (trailer opcional)
app.get("/stream/:type/:id", async (req, res) => {
  try {
    const { type } = req.params;
    const rawId = req.params.id;
    const parts = rawId.split(":");
    const tmdbId = parts.length === 3 ? parts[2] : rawId;

    const details = await getFullDetails(type, tmdbId);
    const trailer = (details.videos || [])[0];
    if (trailer) {
      return res.json({ streams: [{ name: "Trailer", title: "Trailer (YouTube)", url: trailer.url }] });
    }
    res.json({ streams: [] });
  } catch (err) {
    console.error("STREAM ERROR:", err?.response?.data || err.message);
    res.json({ streams: [] });
  }
});

// ping
app.get("/", (_req, res) => res.send("OK"));

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon listo en :${PORT}`));
