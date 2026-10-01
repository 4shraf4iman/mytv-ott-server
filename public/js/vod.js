/**
 * VOD (MOVIES & TV SERIES) CATALOG DATA
 * Pre-loaded with high-definition ready-to-play cinema streams, posters, and episode data
 */

const VOD_MOVIES = [
  {
    id: "mov-tears-of-steel",
    title: "Tears of Steel",
    year: "2023",
    rating: "8.6",
    duration: "1h 32m",
    quality: "4K UHD",
    genre: "Sci-Fi / Action",
    poster: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1400&auto=format&fit=crop&q=80",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
    hlsUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    overview: "Set in a dystopian future in Amsterdam, a crew of desperate warriors and scientists try to save the remaining world by connecting a robotic mind to the past to alter a catastrophic destiny.",
    cast: "Derek de Lint, Sergio Hasselbaink, Denise Rebergen",
    director: "Ian Hubert"
  },
  {
    id: "mov-sintel",
    title: "Sintel: The Dragon Quest",
    year: "2022",
    rating: "8.4",
    duration: "1h 28m",
    quality: "1080p HD",
    genre: "Fantasy / Adventure",
    poster: "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1400&auto=format&fit=crop&q=80",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    hlsUrl: "https://bitmovin-a.akamaihd.net/content/sintel/hls/playlist.m3u8",
    overview: "A lone girl travels across the snowy mountains and treacherous deserts of a mythical realm in search of Scales, a baby dragon she nurtured and loved before it was stolen by a beast.",
    cast: "Halina Reijn, Thom Hoffman",
    director: "Colin Levy"
  },
  {
    id: "mov-big-buck-bunny",
    title: "Big Buck Bunny: Forest Kingdom",
    year: "2023",
    rating: "8.9",
    duration: "1h 40m",
    quality: "4K 60FPS",
    genre: "Animation / Comedy",
    poster: "https://images.unsplash.com/photo-1535268647677-300dbf3d78d1?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1400&auto=format&fit=crop&q=80",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    hlsUrl: "https://test-streams.mux.dev/test_001/stream.m3u8",
    overview: "A giant gentle rabbit with a heart of gold takes revenge on three obnoxious forest bullies who torment innocent innocent creatures.",
    cast: "Frank E. Myers, Sacha Goedegebure",
    director: "Sacha Goedegebure"
  },
  {
    id: "mov-elephants-dream",
    title: "Elephants Dream: Cyber Realm",
    year: "2021",
    rating: "7.9",
    duration: "1h 15m",
    quality: "1080p HD",
    genre: "Cyberpunk / Mystery",
    poster: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1400&auto=format&fit=crop&q=80",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    overview: "Two travelers navigate the surreal mechanics of a colossal sentient machine world that shifts according to their inner fears and desires.",
    cast: "Cas Jansen, Tygo Gernandt",
    director: "Bassam Kurdali"
  },
  {
    id: "mov-cosmos-laundromat",
    title: "Cosmos Laundromat: First Cycle",
    year: "2023",
    rating: "9.1",
    duration: "1h 50m",
    quality: "4K HDR",
    genre: "Sci-Fi / Drama",
    poster: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1400&auto=format&fit=crop&q=80",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
    hlsUrl: "https://cph-p2p-msl.akamaized.net/hls/live/200034/test/master.m3u8",
    overview: "On a desolate island, a suicidal sheep named Franck meets a mysterious salesman who gives him the gift of endless lives across the infinite multiverse.",
    cast: "Pierre Bokma, Reinout Scholten van Aschat",
    director: "Mathieu Auvray"
  },
  {
    id: "mov-night-of-living-dead",
    title: "Night of the Living Dead",
    year: "2022 Remaster",
    rating: "8.5",
    duration: "1h 36m",
    quality: "1080p HD",
    genre: "Horror / Thriller",
    poster: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1400&auto=format&fit=crop&q=80",
    streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
    overview: "A diverse group of desperate survivors seek refuge in an abandoned farmhouse as reanimated dead march across the countryside.",
    cast: "Duane Jones, Judith O'Dea, Karl Hardman",
    director: "George A. Romero"
  }
];

const VOD_SERIES = [
  {
    id: "ser-cyber-city",
    title: "Cyber City: Neon Genesis",
    seasonsCount: 1,
    episodesCount: 4,
    rating: "9.2",
    quality: "4K UHD",
    genre: "Cyberpunk / Thriller",
    poster: "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1508739773434-c26b3d09e071?w=1400&auto=format&fit=crop&q=80",
    overview: "In the sprawling metropolis of Neo-Kuala Lumpur in 2088, an underground cyber-detective uncovers an encrypted conspiracy that threatens to erase humanity's consciousness.",
    episodes: [
      {
        epNum: 1,
        title: "Ep 1: The Dark Signal",
        duration: "45m",
        thumb: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
        desc: "A rogue transmission is intercepted across the city towers, awakening memories from a forgotten past."
      },
      {
        epNum: 2,
        title: "Ep 2: Ghost Protocol",
        duration: "48m",
        thumb: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
        desc: "Pursued by automated security squads, the crew descends into the subterranean network of the sector."
      },
      {
        epNum: 3,
        title: "Ep 3: Neural Overdrive",
        duration: "52m",
        thumb: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyBlazes.mp4",
        desc: "A high-stakes breach into the central server mainframe reveals a shocking revelation about the city's architect."
      },
      {
        epNum: 4,
        title: "Ep 4: The Final Awakening",
        duration: "56m",
        thumb: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
        desc: "Season finale: The battle for the future of the metropolis reaches its breathtaking climax."
      }
    ]
  },
  {
    id: "ser-wildlife-malaysia",
    title: "Wild Borneo: Secret Rainforests",
    seasonsCount: 1,
    episodesCount: 3,
    rating: "9.5",
    quality: "4K HDR",
    genre: "Nature / Documentary",
    poster: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
    backdrop: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=1400&auto=format&fit=crop&q=80",
    overview: "Explore the ancient 130-million-year-old rainforests of Malaysia and Borneo, following elusive cloud leopards, pygmy elephants, and hornbills.",
    episodes: [
      {
        epNum: 1,
        title: "Ep 1: Canopy of Kings",
        duration: "50m",
        thumb: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4",
        desc: "Ascend 200 feet above the forest floor into a biodiverse world bathed in golden sunlight."
      },
      {
        epNum: 2,
        title: "Ep 2: River of Shadows",
        duration: "52m",
        thumb: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
        desc: "Follow the Kinabatangan River where wildlife gathers in the twilight hours."
      },
      {
        epNum: 3,
        title: "Ep 3: Night in the Jungle",
        duration: "47m",
        thumb: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=500&auto=format&fit=crop&q=80",
        streamUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
        desc: "Bioluminescent fungi and rare nocturnal creatures emerge under the tropical night sky."
      }
    ]
  }
];
