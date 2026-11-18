'use strict';
// Renzo's Sports Lab V18 — compact, validated ESPN proxy; no credentials or invented scores.
const https = require('https');
const SPORTS = Object.freeze({nfl:'football/nfl',nba:'basketball/nba'});
const ODDS_SPORTS = Object.freeze({nfl:'americanfootball_nfl',nba:'basketball_nba'});
const APP_VERSION = '30.0';
const cache = new Map();
function respond(code,data,ttl=0){return {statusCode:code,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':code===200?`public, max-age=${ttl}, stale-while-revalidate=${Math.max(15,ttl)}`:'no-store','X-Sports-Lab-Version':APP_VERSION},body:JSON.stringify(data)};}
function getJSON(url){return new Promise((resolve,reject)=>{
 const req=https.get(url,{headers:{'User-Agent':'RenzosSportsLab/18.0 (+sports-data research)','Accept':'application/json','Accept-Encoding':'identity'}},res=>{
  if(res.statusCode!==200){res.resume();reject(new Error('Upstream HTTP '+res.statusCode+(res.statusCode===401?' — provider rejected credentials or access; check provider account and plan':'')));return;}
  const chunks=[];let size=0;
  res.on('data',chunk=>{size+=chunk.length;if(size>7e6){req.destroy(new Error('Upstream response too large'));return;}chunks.push(chunk)});
  res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch(_){reject(new Error('Invalid upstream JSON payload'))}});
 });req.setTimeout(10000,()=>req.destroy(new Error('Upstream request timed out')));req.on('error',reject);
});}
async function memo(key,ttl,fetcher){
 const existing=cache.get(key),now=Date.now();
 if(existing&&existing.until>now)return existing.value;
 if(existing?.promise)return existing.promise;
 const promise=Promise.resolve().then(fetcher).then(value=>{if(cache.size>250)cache.clear();cache.set(key,{value,until:Date.now()+ttl});return value},error=>{cache.delete(key);throw error});
 cache.set(key,{promise,until:0});return promise;
}
function scoreNumber(input){const raw=input&&typeof input==='object'?(input.value??input.displayValue):input;if(raw===null||raw===undefined||raw==='')return null;const n=Number(raw);return Number.isFinite(n)&&n>=0&&n<=250?n:null;}
function seasonType(event){const raw=event.season?.type?.id??event.season?.type??event.seasonType?.id??event.seasonType??null;
 if(raw===null)return null;const n=Number(raw);if(Number.isInteger(n))return n;
 const name=String(raw?.name||raw?.displayName||raw).toLowerCase();return name.includes('regular')?2:name.includes('preseason')?1:name.includes('post')||name.includes('playoff')?3:null;
}
function normalizedSchedule(data,teamId,season,assumeRegular=false,league=null){
 const events=Array.isArray(data?.events)?data.events:[],games=[],diagnostics={reported:events.length,final:0,matchingTeam:0,regular:0,withScores:0};
 for(const e of events){
  const stamp=Date.parse(e.date||e.competitions?.[0]?.date||'');
  const eventYear=Number(e.season?.year);
  if(Number.isInteger(eventYear)&&eventYear>=2000&&eventYear<=2100&&eventYear!==season)continue;
  if(!Number.isInteger(eventYear)&&Number.isFinite(stamp)&&league){
   const dt=new Date(stamp),year=dt.getUTCFullYear(),month=dt.getUTCMonth()+1;
   const inferred=league==='nba'?(month>=7?year+1:year):(month<=3?year-1:year);
   if(inferred!==season)continue;
  }
  const comp=e.competitions?.[0]||{},rivals=comp.competitors||[];
  const ours=rivals.find(x=>String(x.team?.id??x.id)===String(teamId)),other=rivals.find(x=>x!==ours);
  if(!ours||!other)continue;diagnostics.matchingTeam++;
  const type=seasonType(e);
  if(type!==2&&!(type===null&&assumeRegular))continue;diagnostics.regular++;
  const complete=comp.status?.type?.completed===true||e.status?.type?.completed===true||comp.status?.type?.state==='post'||e.status?.type?.state==='post';
  if(!complete)continue;diagnostics.final++;
  const time=Date.parse(e.date||comp.date||''),forScore=scoreNumber(ours.score),againstScore=scoreNumber(other.score);
  if(!Number.isFinite(time)||forScore===null||againstScore===null)continue;diagnostics.withScores++;
  const periodScores=c=>(Array.isArray(c.linescores)?c.linescores.slice(0,4).map(x=>scoreNumber(x.value??x.displayValue??x.score)):[]);
  games.push({id:String(e.id),date:new Date(time).toISOString(),for:forScore,against:againstScore,home:ours.homeAway==='home',opponent:String(other.team?.abbreviation||other.team?.displayName||'Opponent').slice(0,60),quarters:periodScores(ours),oppQuarters:periodScores(other)});
 }
 games.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
 return {source:'ESPN team schedule',season,teamId:String(teamId),updatedAt:new Date().toISOString(),reportedEvents:events.length,diagnostics,games};
}
function validYear(n){n=Number(n);return Number.isInteger(n)&&n>=2000&&n<=2100?n:null;}
function validID(id){return /^\d{1,12}$/.test(String(id||''));}
function countPlayerEvents(data){return (data?.seasonTypes||[]).reduce((sum,st)=>sum+(st.categories||[]).reduce((n,c)=>n+(Array.isArray(c.events)?c.events.length:(c.events&&typeof c.events==='object'?Object.keys(c.events).length:0)),0),0)}
async function schedule(base,team,season,league){
 const route=`${base}/teams/${team}/schedule?season=${season}&seasontype=2`;
 let primary,errors=[];
 try{primary=normalizedSchedule(await getJSON(route),team,season,true,league)}catch(e){errors.push(e.message)}
 if(primary?.games.length>=4)return primary;
 try{
  const alt=normalizedSchedule(await getJSON(`${base}/teams/${team}/schedule?season=${season}`),team,season,false,league);
  if(alt.games.length>=4)return {...alt,source:'ESPN team schedule (all-season fallback)'};
  if(!primary||alt.games.length>primary.games.length)primary=alt;
 }catch(e){errors.push(e.message)}
 // ESPN's current-season default route is another supported schedule shape.
 // Reject games from the wrong season to avoid silently mixing historical results.
 if((!primary||primary.games.length<4)&&Math.abs(season-new Date().getUTCFullYear())<=1){
  try{
   const bare=normalizedSchedule(await getJSON(`${base}/teams/${team}/schedule`),team,season,false,league);
   if(bare.games.length>(primary?.games.length||0))primary={...bare,source:'ESPN default team schedule fallback'};
  }catch(e){errors.push(e.message)}
 }
 // NFL week-based scoreboard fallback: fetch only enough RECENT weeks to recover 4 completed games.
 // Not performed for NBA because ESPN's basketball scoreboard is date-scoped.
 if(league==='nfl'&&(!primary||primary.games.length<4)){
  try{
   const currentSeasonYear=new Date().getUTCFullYear();
   if(season>=currentSeasonYear-1&&season<=currentSeasonYear){
    const candidates=[];
    // ESPN scoreboard with year-only dates is a provider convention; validate the response and never fabricate records.
    const d=await getJSON(`${base}/scoreboard?dates=${season}&seasontype=2&limit=500`);
    const all=normalizedSchedule(d,team,season,true,league);
    if(all.games.length>candidates.length)candidates.push(...all.games);
    if(candidates.length>(primary?.games.length||0))primary={...all,source:'ESPN season scoreboard fallback'};
   }
  }catch(e){errors.push(e.message)}
 }
 if(primary)return {...primary,warning:primary.games.length?'':'ESPN returned no usable final regular-season games for this team',upstreamErrors:errors};
 throw new Error(errors.join('; ')||'No schedule feeds returned a valid payload');
}

// Only the Netlify server knows this key. Never include it in an HTML page or API response.
function oddsKey(){return String(process.env.ODDS_API_KEY||'').trim()}
function numberPrice(p){if(p===null||p===undefined||p==='')return null;const n=Number(p);return Number.isFinite(n)&&n>1&&n<1000?n:null}
function impliedProbability(decimal){return numberPrice(decimal)===null?null:1/decimal}
function stripName(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function median(xs){const a=xs.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const k=Math.floor(a.length/2);return a.length%2?a[k]:(a[k-1]+a[k])/2}
function moneylineSummary(item){
 const books=(item?.bookmakers||[]).map(book=>{
  const market=(book.markets||[]).find(m=>m.key==='h2h');
  const home=(market?.outcomes||[]).find(x=>stripName(x.name)===stripName(item.home_team));
  const away=(market?.outcomes||[]).find(x=>stripName(x.name)===stripName(item.away_team));
  const homePrice=numberPrice(home?.price),awayPrice=numberPrice(away?.price);
  const rawHome=impliedProbability(homePrice),rawAway=impliedProbability(awayPrice),total=rawHome+rawAway;
  const spread=(book.markets||[]).find(m=>m.key==='spreads'),totals=(book.markets||[]).find(m=>m.key==='totals');
  const spreadHome=(spread?.outcomes||[]).find(x=>stripName(x.name)===stripName(item.home_team));
  const totalOver=(totals?.outcomes||[]).find(x=>x.name==='Over');
  return {book:String(book.title||book.key||'Provider').slice(0,70),updatedAt:book.last_update||null,
   homeDecimal:homePrice,awayDecimal:awayPrice,homeFair:total>0?rawHome/total:null,awayFair:total>0?rawAway/total:null,
   homeSpread:spreadHome?.point!=null&&Number.isFinite(Number(spreadHome.point))?Number(spreadHome.point):null,
   total:totalOver?.point!=null&&Number.isFinite(Number(totalOver.point))?Number(totalOver.point):null};
 });
 const valid=books.filter(b=>b.homeFair!==null);
 return {id:String(item.id||''),home:String(item.home_team||''),away:String(item.away_team||''),date:item.commence_time||null,
  bookmakers:books,consensus:{booksWithMoneyline:valid.length,homeFair:median(valid.map(b=>b.homeFair)),awayFair:median(valid.map(b=>b.awayFair)),homeSpread:median(books.map(b=>b.homeSpread)),total:median(books.map(b=>b.total))}};
}
function oddsUrl(league,path,markets){const root=`https://api.the-odds-api.com/v4/sports/${ODDS_SPORTS[league]}`;return `${root}${path}?apiKey=${encodeURIComponent(oddsKey())}&regions=us&oddsFormat=decimal&markets=${encodeURIComponent(markets)}`}
async function oddsBoard(league){const raw=await getJSON(oddsUrl(league,'/odds','h2h,spreads,totals'));if(!Array.isArray(raw))throw new Error('Odds provider returned invalid games');return {source:'The Odds API',fetchedAt:new Date().toISOString(),games:raw.map(moneylineSummary)}}
const PROP_KEYS=Object.freeze({
 nfl:{pass_yds:'player_pass_yds',pass_td:'player_pass_tds',rush_yds:'player_rush_yds',rec_yds:'player_reception_yds',receptions:'player_receptions',any_td:'player_anytime_td',rush_td:'player_rush_tds',rec_td:'player_reception_tds',first_td:'player_1st_td',last_td:'player_last_td'},
 nba:{points:'player_points',rebounds:'player_rebounds',assists:'player_assists',threes:'player_threes',pra:'player_points_rebounds_assists'}
});
async function oddsProps(league,eventId,marketKey){
 const apiMarket=PROP_KEYS[league]?.[marketKey];if(!apiMarket)throw new Error('Unsupported prop market');
 const data=await getJSON(oddsUrl(league,`/events/${eventId}/odds`,apiMarket));
 return {source:'The Odds API',fetchedAt:new Date().toISOString(),market:marketKey,providerMarket:apiMarket,
  eventId:String(data.id||''),books:(data.bookmakers||[]).map(b=>({book:String(b.title||b.key||'Book').slice(0,60),updatedAt:b.last_update||null,
  offers:(b.markets||[]).filter(m=>m.key===apiMarket).flatMap(m=>(m.outcomes||[]).map(o=>({name:String(o.name||''),player:String(o.description||''),point:o.point!=null&&Number.isFinite(Number(o.point))?Number(o.point):null,decimal:numberPrice(o.price)}))).filter(x=>x.decimal!==null)})).filter(b=>b.offers.length)};
}

function playerQuarterPoints(data,id){
 const c=data?.header?.competitions?.[0],date=c?.date;
 if(c?.status?.type?.completed!==true||!Number.isFinite(Date.parse(date)))return {valid:false};
 const groups=(data.boxscore?.players||[]).flatMap(t=>t.statistics||[]);let official=null;
 for(const g of groups){const idx=(g.labels||[]).findIndex(x=>String(x).toUpperCase()==='PTS');if(idx<0)continue;for(const a of g.athletes||[]){if(String(a.athlete?.id)!==id||a.didNotPlay||a.active===false)continue;const v=a.stats?.[idx];if(v!==''&&v!=null&&Number.isInteger(Number(v))&&Number(v)>=0)official=Number(v);}}
 if(official===null||!Array.isArray(data.plays))return {valid:false};
 const scores=[0,0,0,0],seen=new Set(),periods=new Set();let total=0;
 for(const play of data.plays){const period=Number(play.period?.number);if(Number.isInteger(period)&&period>0)periods.add(period);if(!play.scoringPlay)continue;if(!play.id||seen.has(String(play.id)))return {valid:false};seen.add(String(play.id));const participants=play.participants;if(!Array.isArray(participants)||!participants[0]?.athlete?.id)return {valid:false};if(String(participants[0].athlete.id)!==id)continue;const points=Number(play.scoreValue);if(!Number.isInteger(period)||period<1||![1,2,3,4].includes(points))return {valid:false};total+=points;if(period<=4)scores[period-1]+=points;}
 if(total!==official||![1,2,3,4].every(p=>periods.has(p)))return {valid:false};
 return {valid:true,date,points:[...scores,scores[0]+scores[1],scores[2]+scores[3]],official};
}

exports.handler=async function handler(event){
 const q=event.queryStringParameters||{};
 if(q.health==='1')return respond(200,{ok:true,version:APP_VERSION,service:'sports',dataProvider:'ESPN unofficial',oddsProvider:'The Odds API',oddsConfigured:!!oddsKey(),cacheEntries:cache.size,modelAudit:'walk-forward same-matchup holdouts; no league-wide calibration'},5);
 if(q.world){
 const paths={epl:'soccer/eng.1',ucl:'soccer/uefa.champions',seriea:'soccer/ita.1',bundesliga:'soccer/ger.1',ligue1:'soccer/fra.1',laliga:'soccer/esp.1',mls:'soccer/usa.1',ligamx:'soccer/mex.1',atp:'tennis/atp',wta:'tennis/wta',mlb:'baseball/mlb',nhl:'hockey/nhl',ufc:'mma/ufc',ncaab:'basketball/mens-college-basketball',ncaaf:'football/college-football'};
 if(!Object.hasOwn(paths,q.world)||!/^\d{8}$/.test(q.date||''))return respond(400,{error:'Invalid competition or date'});
 const days=Number(q.days||1), start=new Date(q.date.slice(0,4)+'-'+q.date.slice(4,6)+'-'+q.date.slice(6,8)+'T00:00:00Z');
 if(!Number.isInteger(days)||days<1||days>7||!Number.isFinite(+start)||start.toISOString().slice(0,10).replace(/-/g,'')!==q.date)return respond(400,{error:'Invalid date or range'});
 const end=new Date(+start+(days-1)*86400000).toISOString().slice(0,10).replace(/-/g,'');const dates=days===1?q.date:q.date+'-'+end;
 const base=`https://site.api.espn.com/apis/site/v2/sports/${paths[q.world]}/scoreboard`;
 async function board(date){const data=await getJSON(`${base}?dates=${date}`);if(!Array.isArray(data.events))throw Error('Provider event list missing');return data.events;}
 const dayAt=i=>new Date(+start+i*86400000).toISOString().slice(0,10).replace(/-/g,'');
 try{return respond(200,await memo(`world:${q.world}:${dates}`,30000,async()=>{
  const found=new Map(),failed=[];let cursor=0;
  // Keep requests bounded: the browser loads at most seven days per call.
  if(days>7)throw Error('Use seven-day batches for longer schedules');
  await Promise.all(Array.from({length:Math.min(days,4)},async()=>{while(cursor<days){const day=dayAt(cursor++);try{const events=await board(day);for(const e of events)if(e.id!=null)found.set(String(e.id),e);}catch(e){failed.push({date:day,error:e.message});}}}));
  if(failed.length===days)throw Error(failed[0].error+' (daily scoreboard)');
  return {events:[...found.values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)),complete:failed.length===0,failedDays:failed,method:'daily batches',fetchedAt:new Date().toISOString()};
 }),15)}catch(e){return respond(502,{error:'World scoreboard unavailable',detail:e.message})}
 }
 if(!Object.hasOwn(SPORTS,q.league))return respond(400,{error:'league must be nfl or nba'});
 const base=`https://site.api.espn.com/apis/site/v2/sports/${SPORTS[q.league]}`;
 try{
  if(q.odds==='1'){
   if(!oddsKey())return respond(200,{configured:false,source:'The Odds API',games:[],message:'Set ODDS_API_KEY in Netlify environment variables to enable verified sportsbook odds.'},120);
   return respond(200,{configured:true,...await memo(`odds:${q.league}`,4*60*1000,()=>oddsBoard(q.league))},90);
  }
  if(q.oddsProps){
   if(!oddsKey())return respond(200,{configured:false,books:[],message:'ODDS_API_KEY is not configured'},120);
   if(!/^[a-fA-F0-9]{16,64}$/.test(String(q.oddsProps)))return respond(400,{error:'Invalid odds event ID'});
   if(!Object.hasOwn(PROP_KEYS[q.league],q.market||''))return respond(400,{error:'Invalid prop market'});
   return respond(200,{configured:true,...await memo(`oddsProps:${q.league}:${q.oddsProps}:${q.market}`,10*60*1000,()=>oddsProps(q.league,q.oddsProps,q.market))},120);
  }

  if(q.schedule){
   if(!validID(q.schedule))return respond(400,{error:'Invalid team ID'});
   const season=validYear(q.season);if(season===null)return respond(400,{error:'Invalid season'});
   const value=await memo(`schedule:${q.league}:${q.schedule}:${season}`,valueTTL(7*60*1000),()=>schedule(base,q.schedule,season,q.league));
   return respond(200,value,90);
  }
  if(q.player){
   if(!validID(q.player))return respond(400,{error:'Invalid player ID'});
   const season=validYear(q.season);if(season===null)return respond(400,{error:'Invalid season'});
   const value=await memo(`player:${q.league}:${q.player}:${season}`,valueTTL(10*60*1000),async()=>{
    const url=`https://site.web.api.espn.com/apis/common/v3/sports/${SPORTS[q.league]}/athletes/${q.player}/gamelog?season=${season}`;
    const res=await getJSON(url);
    return {...res,_lab:{source:'ESPN athlete gamelog',requestedSeason:season,reportedStatRows:countPlayerEvents(res),fetchedAt:new Date().toISOString()}};
   });return respond(200,value,100);
  }
  if(q.team){if(!validID(q.team))return respond(400,{error:'Invalid team ID'});
   return respond(200,await memo(`roster:${q.league}:${q.team}`,25*60*1000,()=>getJSON(`${base}/teams/${q.team}/roster`)),120);
  }
  if(q.quarterPlayer){if(q.league!=='nba'||!validID(q.quarterPlayer)||!validID(q.event))return respond(400,{error:'Invalid player quarter request'});const data=await memo(`summary:${q.league}:${q.event}`,60000,()=>getJSON(`${base}/summary?event=${q.event}`));return respond(200,playerQuarterPoints(data,String(q.quarterPlayer)),60);}
  if(q.event){if(!/^[a-zA-Z0-9_-]{1,30}$/.test(q.event))return respond(400,{error:'Invalid event ID'});
   return respond(200,await memo(`summary:${q.league}:${q.event}`,45*1000,()=>getJSON(`${base}/summary?event=${q.event}`)),30);
  }
  const date=q.date||new Date().toISOString().slice(0,10).replace(/-/g,'');
  if(!/^\d{8}$/.test(date))return respond(400,{error:'Invalid date; use YYYYMMDD'});
  const y=+date.slice(0,4),m=+date.slice(4,6),d=+date.slice(6,8),check=new Date(Date.UTC(y,m-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d)return respond(400,{error:'Invalid calendar date'});
  return respond(200,await memo(`board:${q.league}:${date}`,22*1000,()=>getJSON(`${base}/scoreboard?dates=${date}&limit=100`)),15);
 }catch(e){return respond(502,{error:'Verified sports data unavailable',detail:String(e.message||'Unknown ESPN failure').slice(0,240),version:APP_VERSION});}
};
function valueTTL(n){return n;}
// Defense-in-depth rate limit for this public sports proxy (subject to Netlify deployment enforcement).
exports.config={path:'/.netlify/functions/sports',rateLimit:{windowLimit:100,windowSize:60,aggregateBy:['ip','domain']}};
exports._test={playerQuarterPoints,normalizedSchedule,scoreNumber,seasonType,countPlayerEvents,moneylineSummary,impliedProbability,median,PROP_KEYS};
