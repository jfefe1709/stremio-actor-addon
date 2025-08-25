const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 7000;

// Manifest
const manifest = {
  id: "org.example.actorserieswrapper",
  version: "1.0.0",
  name: "Películas y Series por Actor/Director",
  description: "Filtra películas y series por actor/director usando el addon oficial de TMDb",
  resources: ["catalog"],
  types: ["movie","series"],
  idPrefixes: ["tmdb-"],
  catalogs: [
    { type: "movie", id: "actor-catalog", name: "Buscar Películas por Actor/Director" },
    { type: "series", id: "actor-catalog-series", name: "Buscar Series por Actor/Director" }
  ]
};

// Manifest endpoint
app.get("/manifest.json", (req,res) => res.json(manifest));

// Función para obtener personas del addon oficial de TMDb
async function getPeople(query) {
  try {
    const url = `https://stremio.tmdbaddon.org/catalog/person/search/${encodeURIComponent(query)}.json`;
    const resp = await axios.get(url);
    if (!resp.data || !resp.data.metas) return [];
    return resp.data.metas;
  } catch (err) {
    console.error(err);
    return [];
  }
}

// Función para filtrar y ordenar películas/series
async function getPersonMetas(person, type) {
  try {
    const url = type === "movie"
      ? `https://stremio.tmdbaddon.org/catalog/movie/popular.json`
      : `https://stremio.tmdbaddon.org/catalog/series/popular.json`;

    const resp = await axios.get(url);
    const allMetas = resp.data.metas || [];

    // Filtrar por el ID de la persona en el cast o director
    const filtered = allMetas.filter(m=>{
      const castIds = m.cast_ids || [];
      const directorIds = m.director_ids || [];
      return castIds.includes(person.id) || directorIds.includes(person.id);
    });

    // Ordenar por puntuación IMDb descendente
    filtered.sort((a,b)=>(b.imdbRating || 0) - (a.imdbRating || 0));

    return filtered.map(m=>({
      id: m.id,
      type: m.type,
      name: m.name || m.title,
      poster: m.poster || "",
      imdbRating: m.imdbRating || 0
    }));
  } catch(err) {
    console.error(err);
    return [];
  }
}

// Endpoint de catálogo
app.get("/catalog/:type/:query", async (req,res) => {
  const { type, query } = req.params;
  if (!query) return res.json({ metas: [] });

  const people = await getPeople(query);

  // Ordenar personas por número de créditos (mayor a menor)
  people.sort((a,b)=> (b.credits || 0) - (a.credits || 0));

  const metas = [];
  for (const person of people) {
    const personMetas = await getPersonMetas(person, type);
    if (personMetas.length > 0) {
      metas.push({
        id: `${type}-section-${person.id}`,
        type,
        name: type === "movie" ? `Películas - ${person.name}` : `Series - ${person.name}`,
        metas: personMetas
      });
    }
  }

  res.json({ metas });
});

// Escucha en Render
app.listen(PORT, '0.0.0.0', () => console.log(`Addon listo en Render en puerto ${PORT}`));
