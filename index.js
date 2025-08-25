const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 7000;  // Render asigna el puerto automáticamente
const TMDB_API_KEY = "f4273ae35c295c6dd7cd5f05e4e535d8";

const manifest = {
  id: "org.example.actorseriesrender",
  version: "1.0.0",
  name: "Películas y Series por Actor/Director",
  description: "Muestra películas y series de actores o directores con títulos completos y puntuación IMDb",
  resources: ["catalog"],
  types: ["movie","series"],
  catalogs: [
    { type: "movie", id: "actor-catalog", name: "Buscar Películas por Actor/Director" },
    { type: "series", id: "actor-catalog-series", name: "Buscar Series por Actor/Director" }
  ]
};

// Endpoint del manifest
app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// Endpoint de catálogo
app.get("/catalog/:type/:query", async (req,res)=>{
  const { type, query } = req.params;
  if (!query) return res.json({ metas: [] });

  try {
    // Buscar personas en TMDb
    const peopleRes = await axios.get("https://api.themoviedb.org/3/search/person", {
      params: { api_key: TMDB_API_KEY, query, language: "es-ES" }
    });

    const people = peopleRes.data.results.sort((a,b)=> b.known_for.length - a.known_for.length);
    const metas = [];

    for (const person of people) {
      const movies = person.known_for.filter(i=>i.media_type==="movie").sort((a,b)=>b.vote_average - a.vote_average);
      const series = person.known_for.filter(i=>i.media_type==="tv").sort((a,b)=>b.vote_average - a.vote_average);

      if (type==="movie" && movies.length>0) {
        metas.push({
          id: `movies-${person.id}`,
          type: "movie",
          name: `Películas - ${person.name}`,
          items: movies.map(m=>({
            id: `tmdb-${m.id}`,
            name: m.title,
            poster: m.poster_path?`https://image.tmdb.org/t/p/w500${m.poster_path}`:"",
            imdbRating: m.vote_average
          }))
        });
      }

      if (type==="series" && series.length>0) {
        metas.push({
          id: `series-${person.id}`,
          type: "series",
          name: `Series - ${person.name}`,
          items: series.map(s=>({
            id: `tmdb-${s.id}`,
            name: s.name,
            poster: s.poster_path?`https://image.tmdb.org/t/p/w500${s.poster_path}`:"",
            imdbRating: s.vote_average
          }))
        });
      }
    }

    res.json({ metas });
  } catch(err){
    console.error(err);
    res.json({ metas: [] });
  }
});

// Escucha en todas las interfaces (0.0.0.0) para Render
app.listen(PORT, '0.0.0.0', ()=>console.log(`Addon ejecutándose en Render en el puerto ${PORT}`));
