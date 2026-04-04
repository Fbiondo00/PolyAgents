https://docs.polymarket.com/api-reference/search/search-markets-events-and-profiles
Certo — questo endpoint è il GET /public-search della Gamma API di Polymarket e serve per cercare markets, events e profiles tramite una query testuale, con vari filtri e opzioni di paginazione. La documentazione mostra come base URL https://gamma-api.polymarket.com e indica che la risposta contiene sezioni come events, tags, profiles e pagination.
Endpoint
Metodo: GET
Path: /public-search
Base URL: https://gamma-api.polymarket.com
URL completa:
text
GET https://gamma-api.polymarket.com/public-search
Descrizione: esegue una ricerca pubblica su mercati, eventi e profili.
Parametri
Query parameters
Parametro
Tipo
Obbligatorio
Descrizione
q
string
Sì
Testo della ricerca. 
cache
boolean
No
Abilita o controlla l’uso della cache. 
events_status
string
No
Filtro sullo stato degli eventi. 
limit\_per\_type
integer
No
Numero massimo di risultati per tipo. 
page
integer
No
Pagina dei risultati. 
events_tag
string\[\]
No
Filtro per tag evento. 
keep\_closed\_markets
integer
No
Controlla l’inclusione dei market chiusi. 
sort
string
No
Campo di ordinamento. 
ascending
boolean
No
Direzione dell’ordinamento. 
search_tags
boolean
No
Include la ricerca nei tag. 
search_profiles
boolean
No
Include la ricerca nei profili. 
recurrence
string
No
Filtro di ricorrenza, utile per series o eventi ricorrenti. 
exclude\_tag\_id
integer\[\]
No
Esclude uno o più tag ID dai risultati. 
optimized
boolean
No
Richiede una risposta ottimizzata secondo la documentazione. 
La query q è l’unico parametro obbligatorio; tutti gli altri servono per restringere o rifinire il risultato della ricerca.
Response
La risposta 200 application/json restituisce un oggetto con più sezioni, in particolare events, tags, profiles e pagination.
Schema logico:
json
{  "events":
,  "profiles":  \
,  "pagination":  {  "hasMore":  true,  "totalResults":  123  } }
Campi top-level
Campo
Tipo
Descrizione
events
object\[\] |||BACKSLASH|||| null
Lista degli eventi trovati. 
tags
object\[\] |||BACKSLASH|||| null
Lista dei tag trovati. 
profiles
object\[\] |||BACKSLASH|||| null
Lista dei profili trovati. 
pagination
object
Metadati di paginazione. 
Campi di pagination
Campo
Tipo
Descrizione
hasMore
boolean
Indica se esistono altri risultati. 
totalResults
number
Numero totale dei risultati. 
Struttura dei risultati
Gli oggetti in events possono essere molto ricchi e includere campi come id, ticker, slug, title, subtitle, description, startDate, endDate, image, icon, active, closed, liquidity, volume, category, markets, series, tags, collections e altri metadati operativi.
Gli oggetti in profiles includono campi come id, name, user, referral, profileImage, bio, proxyWallet, walletActivated, pseudonym e metadati di tracking e ottimizzazione immagine.
Esempi d’uso
Esempio base:
bash
curl --request GET \  --url "https://gamma-api.polymarket.com/public-search?q=trump"
Questo segue il formato ufficiale dell’endpoint e usa il solo parametro obbligatorio q.
Esempio con più filtri:
bash
curl --request GET \  --url "https://gamma-api.polymarket.com/public-search?q=election&limit\_per\_type=10&page=1&search_profiles=true&ascending=false"
In questo caso la ricerca usa paginazione, limita i risultati per tipo e include anche i profili.
Schema tecnico pronto da copiare
text
endpoint:  method: GET base_url: https://gamma-api.polymarket.com path: /public-search auth: none response_type: application/json description: Search markets, events, and profiles   query_params:  - name: q type: string required: true description: Search query   - name: cache type: boolean required: false   - name: events_status type: string required: false   - name: limit_per_type type: integer required: false   - name: page type: integer required: false   - name: events_tag type: string
required: false   - name: optimized type: boolean required: false   response:  type: object properties: events: type: array nullable: true items: type: object tags: type: array nullable: true items: type: object profiles: type: array nullable: true items: type: object pagination: type: object properties: hasMore: type: boolean totalResults: type: number
Questo schema rispecchia la pagina ufficiale Search markets, events, and profiles della documentazione Polymarket.
