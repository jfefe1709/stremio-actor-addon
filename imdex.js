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
    { type: "movie", id: "people-filmography", name: "Películas", extraSupported: ["search"] },
    { type: "series", id: "people-filmography", name: "Series", extraSupported: ["search"] }
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
  return (data.results || []).sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0] || null;
}

async function getFilmography(personId) {
  const data = await tmdb(`/person/${personId}/combined_credits`);
  return {
    movies: (data.cast || []).filter(c => c.media_type === "movie"),
    tv: (data.cast || []).filter(c => c.media_type === "tv")
  };
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

/* ================= ENDPOINTS ================= */

// manifest
app.get("/manifest.json", (_req, res) => res.json(manifest));

// catalog
app.get("/catalog/:type/:id", async (req, res) => {
  try {
    const { type } = req.params; // "movie" o "series"
    const search = req.query.search;
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
    console.error(err);
    res.json({ metas: [] });
  }
});

// meta
app.get("/meta/:type/:id", async (req, res) => {
  try {
    const { type } = req.params;
    const tmdbId = req.params.id.split(":")[2];
    const meta = await getFullDetails(type, tmdbId);
    res.json({ meta });
  } catch (err) {
    console.error(err);
    res.json({ meta: {} });
  }
});

// ping
app.get("/", (_req, res) => res.send("OK"));

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon listo en :${PORT}`));
