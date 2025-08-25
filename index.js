const express = require("express");
const axios = require("axios");

const TMDB_API_KEY = process.env.TMDB_API_KEY || "f4273ae35c295c6dd7cd5f05e4e535d8";
const TMDB = "https://api.themoviedb.org/3";

// Manifest
const manifest = {
  id: "org.jfefe1709.actorfilmography",
  name: "Filmografía por Persona",
  version: "1.0.0",
  description: "Filtrando catálogo oficial de TMDb por actor/director, separado en Películas y Series, ordenado por puntuación.",
  resources: ["catalog"],
  types: ["movie", "series"],
  idPrefixes: ["tmdb"],
  catalogs: [
    { type: "movie", id: "people-filter-movies", name: "Películas", extraSupported: ["search"] },
    { type: "series", id: "people-filter-series", name: "Series", extraSupported: ["search"] }
  ]
};

const app = express();

// Helpers
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

// Map to catalog item
function mapToMetaItem(type, item) {
  return {
    id: `tmdb:${type}:${item.id}`,
    type,
    name: item.title || item.name,
    score: item.vote_average,
  };
}

// Endpoints
app.get("/manifest.json", (_req, res) => res.json(manifest));

app.get("/catalog/:type/:id", async (req, res) => {
  try {
    const { type } = req.params;
    const search = req.query.search;
    if (!search || !search.trim()) return res.json({ metas: [] });

    const person = await searchPerson(search.trim());
    if (!person) return res.json({ metas: [] });

    const { movies, tv } = await getFilmography(person.id);

    let pool = [];
    if (type === "movie") pool = movies.sort((a, b) => b.vote_average - a.vote_average);
    if (type === "series") pool = tv.sort((a, b) => b.vote_average - a.vote_average);

    const metas = pool.map(item => mapToMetaItem(type, item));

    res.json({ metas });
  } catch (err) {
    console.error(err);
    res.json({ metas: [] });
  }
});

// Ping
app.get("/", (_req, res) => res.send("OK"));

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Addon listo en :${PORT}`));
