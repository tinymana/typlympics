import ne from"npm:postgres@3.4.5";function D(e){let t=1779033703^e.length;for(let n=0;n<e.length;n++)t=Math.imul(t^e.charCodeAt(n),3432918353),t=t<<13|t>>>19;return()=>(t=Math.imul(t^t>>>16,2246822507),t=Math.imul(t^t>>>13,3266489909),t^=t>>>16,t>>>0)}function N(e){let t=D(e)(),n=()=>{t=t+1831565813|0;let r=Math.imul(t^t>>>15,1|t);return r=r+Math.imul(r^r>>>7,61|r)^r,((r^r>>>14)>>>0)/4294967296},a=r=>Math.floor(n()*r);return{next:n,int:a,pick(r){if(r.length===0)throw new Error("cannot pick from an empty list");return r[a(r.length)]}}}var L=`
of to in it is be as at so we he by or on do if me my up an go no us am
the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use
that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what year also back call down even find give hand high keep last left life live look most move must name need next open part play real room same seem show side tell then turn walk week work
about after again being could every first found great house large learn never other place plant point right small sound spell still study their there these thing think three water where which world would write young under while might night light start state story party paper music group early earth happy heart heavy horse money month river
before better change school should people number mother father friend around little always animal answer almost family follow letter listen second simple street strong system travel window wonder across during enough ground making really
because between through another thought against country picture several morning nothing outside present problem program quickly science someone teacher without general example brought
children together question remember sentence business complete consider continue describe distance exercise familiar interest language mountain personal possible practice probably standing surprise thousand tomorrow yourself
`,k=Object.freeze(Array.from(new Set(L.split(/\s+/).filter(e=>e.length>0)))),R=2,A=8;var v=1,P=Object.freeze({min:5.5,max:13.5});function V(e){let t=e/100;return{min:P.min*t,max:P.max*t}}var O=200,W=(()=>{let e=new Map;for(let t of k){let n=e.get(t.length)??[];n.push(t),e.set(t.length,n)}return e})(),M=(()=>{let e=["qaz","wsx","edc","rfvtgb","yhnujm","ik","ol","p"],t={};return e.forEach((n,a)=>{for(let r of n)t[r]=a}),t})(),q=new Set(["q","z","x","j"]);function F(e){let t=0;for(let n=0;n<e.length;n++){let a=e[n];if(q.has(a)&&(t+=1.5),n===0)continue;let r=e[n-1];a===" "||r===" "||(a===r?t+=.5:M[a]!==void 0&&M[a]===M[r]&&(t+=2))}return t}function G(e,t){if(t<R)throw new Error(`length ${t} is too short for a line`);let n=[],a=t,r="";for(;;){if(a<=A){let s=(W.get(a)??[]).filter(m=>m!==r);n.push(e.pick(s));break}let o;do o=e.pick(k);while(o===r||a-o.length-1<R);n.push(o),r=o,a-=o.length+1}return n.join(" ")}function j(e,t=100){let n=N(`sprint:${v}:${t}:${e}`),a=V(t),r=null;for(let s=1;s<=O;s++){let m=G(n,t),d=F(m);if(d>=a.min&&d<=a.max)return{seed:e,text:m,difficulty:d,attempts:s,generatorVersion:v};let c=Math.min(Math.abs(d-a.min),Math.abs(d-a.max));(r===null||c<r.distance)&&(r={text:m,difficulty:d,distance:c})}let o=r;return{seed:e,text:o.text,difficulty:o.difficulty,attempts:O,generatorVersion:v}}var S=Object.freeze(["100m","200m","400m","800m","1500m"]),K=Object.freeze({id:"100m@1",event:"100m",version:1,distance:100,errorLockoutMs:200,falseStartPenaltyMs:300,minReactionMs:100,splitMarks:Object.freeze([30,60,100]),medalsMs:Object.freeze({bronze:2e4,silver:15e3,gold:12e3,worldClass:1e4})});function f(e,t,n){let a=r=>Math.round(t/5/r*6e4);return Object.freeze({id:`${e}@1`,event:e,version:1,distance:t,errorLockoutMs:200,falseStartPenaltyMs:300,minReactionMs:100,splitMarks:Object.freeze(n),medalsMs:Object.freeze({bronze:a(60),silver:a(80),gold:a(100),worldClass:a(120)})})}var H=f("200m",200,[50,100,150,200]),X=f("400m",400,[100,200,300,400]),Z=f("800m",800,[200,400,600,800]),J=f("1500m",1500,[400,800,1200,1500]),y=Object.freeze({"100m":K,"200m":H,"400m":X,"800m":Z,"1500m":J});var w=class extends Error{constructor(t){super(t),this.name="SimInputError"}};function Q(e,t){if(t.length!==e.distance)throw new w(`text length ${t.length} does not match race distance ${e.distance}`);return{ruleset:e,text:t,pos:0,lockedUntil:Number.NEGATIVE_INFINITY,lastT:Number.NEGATIVE_INFINITY,errors:0,ignored:0,falseStart:!1,reactionMs:null,advanceTimes:[],finished:!1}}function ee(e,t){if(!Number.isInteger(t.t))throw new w(`timestamp must be an integer number of ms, got ${t.t}`);if(typeof t.ch!="string"||t.ch.length!==1)throw new w("input must be exactly one character");if(t.t<e.lastT)throw new w(`timestamps must not decrease (${t.t} after ${e.lastT})`);if(e.finished)return"afterFinish";let n=e.ruleset;return e.lastT=t.t,t.t<0?(e.falseStart=!0,e.lockedUntil=Math.max(e.lockedUntil,n.falseStartPenaltyMs),"falseStart"):e.reactionMs===null&&(e.reactionMs=t.t,t.t<n.minReactionMs)?(e.falseStart=!0,e.lockedUntil=Math.max(e.lockedUntil,t.t+n.falseStartPenaltyMs),"falseStart"):t.t<e.lockedUntil?(e.ignored+=1,"locked"):t.ch===e.text[e.pos]?(e.pos+=1,e.advanceTimes.push(t.t),e.pos===n.distance?(e.finished=!0,"finish"):"advance"):(e.errors+=1,e.lockedUntil=t.t+n.errorLockoutMs,"error")}function te(e){let t=e.ruleset,n=e.finished?e.advanceTimes[t.distance-1]??null:null,a=e.pos+e.errors,r=[];for(let o of t.splitMarks){let s=e.advanceTimes[o-1];s!==void 0&&r.push({mark:o,tMs:s})}return{rulesetId:t.id,finished:e.finished,timeMs:n,reactionMs:e.reactionMs,falseStart:e.falseStart,distance:e.pos,errors:e.errors,ignored:e.ignored,accuracy:a===0?1:e.pos/a,wpm:n!==null&&n>0?t.distance/5/(n/6e4):null,splits:r,advanceTimes:e.advanceTimes.slice()}}function Y(e,t,n){let a=Q(e,t);for(let r of n)ee(a,r);return te(a)}var i=ne(Deno.env.get("SUPABASE_DB_URL"),{prepare:!1,max:2,idle_timeout:20}),$=4,re=5,z=15,ae=6e3,oe=20,se=8e3,ie=1500,le=300,B={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"},l=class extends Error{constructor(n,a,r=400){super(a);this.code=n;this.status=r}code;status};function u(e,t){let n=e[t];if(typeof n!="string")throw new l("bad_request",`"${t}" is required.`);return n}function ce(e){return e.toUpperCase().replace(/[^A-Z0-9 ]/g,"").replace(/\s+/g," ").trim().slice(0,12).trim()}function U(e){let t=new Uint8Array(e);return crypto.getRandomValues(t),Array.from(t,n=>n.toString(16).padStart(2,"0")).join("")}async function C(e){let t=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(e));return Array.from(new Uint8Array(t),n=>n.toString(16).padStart(2,"0")).join("")}async function me(e){let t=ce(u(e,"name")),n=u(e,"pin"),a=typeof e.nationality=="string"?e.nationality.toUpperCase():"";if(!t)throw new l("bad_name","A name is required.");if(!/^[0-9]{4}$/.test(n))throw new l("bad_pin","The PIN must be four digits.");let r=!1,o=await i`
    select id, name, nationality, pin_hash = extensions.crypt(${n}, pin_hash) as ok,
           coalesce(locked_until > now(), false) as locked
    from typlympics.athletes where name = ${t}`;if(o.length===0){if(!/^[A-Z]{3}$/.test(a))throw new l("bad_nationality","A nationality is required for a new athlete.");if(o=await i`
      insert into typlympics.athletes (name, nationality, pin_hash)
      values (${t}, ${a}, extensions.crypt(${n}, extensions.gen_salt('bf', 10)))
      on conflict (name) do nothing
      returning id, name, nationality, true as ok, false as locked`,o.length===0)throw new l("name_taken","That name was just taken. Try again.");r=!0}let s=o[0];if(s.locked)throw new l("locked",`Too many wrong PINs. Try again in ${z} minutes.`,429);if(!s.ok)throw await i`
      update typlympics.athletes
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= ${re} then now() + make_interval(mins => ${z}) else locked_until end
      where id = ${s.id}`,new l("wrong_pin","That name is taken online and the PIN does not match.",401);r||await i`update typlympics.athletes set failed_attempts = 0, locked_until = null where id = ${s.id}`;let m=U(32);return await i`insert into typlympics.sessions (token_hash, athlete_id) values (${await C(m)}, ${s.id})`,await i`delete from typlympics.sessions where athlete_id = ${s.id} and last_seen < now() - interval '30 days'`,{token:m,created:r,athlete:{id:s.id,name:s.name,nationality:s.nationality}}}async function p(e){let t=u(e,"token"),n=await i`
    update typlympics.sessions s set last_seen = now()
    from typlympics.athletes a
    where s.token_hash = ${await C(t)} and a.id = s.athlete_id
    returning a.id, a.name, a.nationality`;if(n.length===0)throw new l("signed_out","Sign in again.",401);return n[0]}async function de(e){return 6e4+y[e].distance*4e3}async function x(e){let n=(await i`
    select r.id, r.event, extract(epoch from (now() - r.gun_at)) * 1000 as since_gun
    from typlympics.rooms m join typlympics.races r on r.id = m.race_id
    where m.pin = ${e} and m.state = 'racing'`)[0];n&&Number(n.since_gun)>await de(n.event)&&(await i`update typlympics.race_entries set status = 'dnf', submitted_at = now() where race_id = ${n.id} and status = 'racing'`,await i`update typlympics.rooms set state = 'done', updated_at = now() where pin = ${e}`)}async function g(e){let n=(await i`select pin, host_id, event, state, race_id from typlympics.rooms where pin = ${e}`)[0];if(!n)throw new l("no_room","No race room has that PIN.",404);let a=await i`
    select a.id, a.name, a.nationality, m.lane
    from typlympics.room_members m join typlympics.athletes a on a.id = m.athlete_id
    where m.pin = ${e} order by m.lane`,r=null;if(n.race_id){let s=(await i`
      select id, event, ruleset_id, seed, extract(epoch from (gun_at - now())) * 1000 as gun_in_ms
      from typlympics.races where id = ${n.race_id}`)[0];s&&(r={id:s.id,event:s.event,rulesetId:s.ruleset_id,seed:s.seed,gunInMs:Math.round(Number(s.gun_in_ms))})}return{pin:n.pin,hostId:n.host_id,event:n.event,state:n.state,maxPlayers:$,members:a,race:r}}async function T(e){await i`
    delete from typlympics.room_members m using typlympics.rooms r
    where m.pin = ${e} and r.pin = m.pin and r.state <> 'racing'
      and m.last_seen < now() - make_interval(secs => ${oe})`;let n=(await i`
    select r.host_id, (select athlete_id from typlympics.room_members where pin = r.pin order by lane limit 1) as first_member,
           exists (select 1 from typlympics.room_members where pin = r.pin and athlete_id = r.host_id) as host_present
    from typlympics.rooms r where r.pin = ${e}`)[0];n&&(n.first_member?n.host_present||await i`update typlympics.rooms set host_id = ${n.first_member} where pin = ${e}`:await i`delete from typlympics.rooms where pin = ${e}`)}async function ue(e){let t=await p(e),n=u(e,"event");if(!S.includes(n))throw new l("bad_event","Unknown distance.");await i`delete from typlympics.rooms where host_id = ${t.id} or updated_at < now() - interval '6 hours'`,await i`delete from typlympics.room_members where athlete_id = ${t.id}`;for(let a=0;a<12;a++){let r=String(1e4+crypto.getRandomValues(new Uint32Array(1))[0]%9e4);if((await i`
      insert into typlympics.rooms (pin, host_id, event) values (${r}, ${t.id}, ${n})
      on conflict (pin) do nothing returning pin`).length)return await i`insert into typlympics.room_members (pin, athlete_id, lane) values (${r}, ${t.id}, 0)`,{room:await g(r),you:t.id}}throw new l("busy","Could not open a room. Try again.",503)}async function pe(e){let t=await p(e),n=u(e,"pin");await T(n);let r=(await i`select state from typlympics.rooms where pin = ${n}`)[0];if(!r)throw new l("no_room","No race room has that PIN.",404);if((await i`select 1 from typlympics.room_members where pin = ${n} and athlete_id = ${t.id}`).length===0){if(r.state==="racing")throw new l("in_progress","That race has already started. Wait for the next one.");if(await i`delete from typlympics.room_members where athlete_id = ${t.id}`,(await i`
      insert into typlympics.room_members (pin, athlete_id, lane)
      select ${n}, ${t.id}, lane from generate_series(0, ${$-1}) as lane
      where lane not in (select lane from typlympics.room_members where pin = ${n})
      order by lane limit 1
      on conflict do nothing returning lane`).length===0)throw new l("full",`That room is full (${$} athletes).`)}return{room:await g(n),you:t.id}}async function we(e){let t=await p(e),n=u(e,"pin");if((await i`update typlympics.room_members set last_seen = now() where pin = ${n} and athlete_id = ${t.id} returning 1`).length===0)throw new l("not_member","You are not in that room.",403);return await T(n),await x(n),{room:await g(n),you:t.id}}async function ye(e){let t=await p(e),n=u(e,"pin");return await i`delete from typlympics.room_members where pin = ${n} and athlete_id = ${t.id}`,await T(n),{}}async function he(e){let t=await p(e),n=u(e,"pin");await x(n);let r=(await i`select host_id, event, state from typlympics.rooms where pin = ${n}`)[0];if(!r)throw new l("no_room","No race room has that PIN.",404);if(r.host_id!==t.id)throw new l("not_host","Only the host can start the race.",403);if(r.state==="racing")throw new l("in_progress","A race is already running.");let o=typeof e.event=="string"&&S.includes(e.event)?e.event:r.event,s=ae+crypto.getRandomValues(new Uint32Array(1))[0]%1500,d=(await i`
    insert into typlympics.races (pin, event, ruleset_id, seed, gun_at)
    values (${n}, ${o}, ${y[o].id}, ${U(8)}, now() + make_interval(secs => ${s/1e3}))
    returning id`)[0].id;return await i`
    insert into typlympics.race_entries (race_id, athlete_id, lane)
    select ${d}, athlete_id, lane from typlympics.room_members where pin = ${n}`,await i`update typlympics.rooms set state = 'racing', race_id = ${d}, event = ${o}, updated_at = now() where pin = ${n}`,{room:await g(n),you:t.id}}function fe(e,t){if(!Array.isArray(e))throw new l("bad_log","A keystroke log is required.");if(e.length>t*4+200)throw new l("bad_log","The keystroke log is too long.");return e.map(n=>{if(!Array.isArray(n)||!Number.isInteger(n[0])||typeof n[1]!="string"||n[1].length!==1)throw new l("bad_log","The keystroke log is malformed.");return{t:n[0],ch:n[1]}})}async function _e(e){let t=await p(e),n=u(e,"raceId"),r=(await i`
    select r.id, r.pin, r.event, r.seed, e.status, extract(epoch from (now() - r.gun_at)) * 1000 as since_gun
    from typlympics.races r join typlympics.race_entries e on e.race_id = r.id
    where r.id = ${n} and e.athlete_id = ${t.id}`)[0];if(!r)throw new l("not_entered","You are not entered in that race.",403);if(r.status!=="racing")throw new l("already_submitted","A result is already recorded for this race.",409);let o=y[r.event],s=e.device==="phone"?"phone":"keyboard",m=fe(e.log,o.distance),d=j(r.seed,o.distance).text,c;try{c=Y(o,d,m)}catch{throw new l("bad_log","The keystroke log breaks the rules of the race.")}let h=c.finished?"finished":"dnf";if(c.finished&&c.timeMs!==null){let b=Number(r.since_gun)-c.timeMs;(b>se||b<-ie||(c.wpm??0)>le)&&(h="review")}await i`
    update typlympics.race_entries
    set status = ${h}, time_ms = ${c.timeMs}, wpm = ${c.wpm===null?null:Math.round(c.wpm*100)/100},
        accuracy = ${Math.round(c.accuracy*1e5)/1e5}, reaction_ms = ${c.reactionMs},
        errors = ${c.errors}, false_start = ${c.falseStart}, log = ${i.json(e.log)}, submitted_at = now(),
        device = ${s}
    where race_id = ${n} and athlete_id = ${t.id} and status = 'racing'`;let E=!1;return h==="finished"&&c.timeMs!==null&&c.wpm!==null&&(E=(await i`
      insert into typlympics.bests (athlete_id, ruleset_id, device, time_ms, wpm, race_id)
      values (${t.id}, ${o.id}, ${s}, ${c.timeMs}, ${Math.round(c.wpm*100)/100}, ${n})
      on conflict (athlete_id, ruleset_id, device) do update
        set time_ms = excluded.time_ms, wpm = excluded.wpm, race_id = excluded.race_id, achieved_at = now()
        where typlympics.bests.time_ms > excluded.time_ms
      returning 1`).length>0),(await i`select 1 from typlympics.race_entries where race_id = ${n} and status = 'racing' limit 1`).length===0&&await i`update typlympics.rooms set state = 'done', updated_at = now() where pin = ${r.pin} and race_id = ${n}`,{result:{status:h,device:s,timeMs:c.timeMs,wpm:c.wpm,accuracy:c.accuracy,reactionMs:c.reactionMs,errors:c.errors,falseStart:c.falseStart,personalBest:E}}}async function ge(e){let t=await p(e),n=u(e,"raceId"),a=Math.max(0,Math.min(2e3,Math.floor(Number(e.pos)||0)));return await i`
    update typlympics.race_entries set progress = greatest(progress, ${a})
    where race_id = ${n} and athlete_id = ${t.id} and status = 'racing'`,{positions:(await i`
    select athlete_id as id, progress, status, time_ms from typlympics.race_entries where race_id = ${n}`).map(o=>({id:o.id,pos:o.progress,status:o.status,timeMs:o.time_ms}))}}async function be(e){await p(e);let t=u(e,"raceId"),n=await i`select pin from typlympics.races where id = ${t}`;n[0]&&await x(n[0].pin);let a=await i`
    select a.id, a.name, a.nationality, e.lane, e.status, e.device, e.time_ms, e.wpm, e.accuracy, e.reaction_ms, e.false_start
    from typlympics.race_entries e join typlympics.athletes a on a.id = e.athlete_id
    where e.race_id = ${t}
    order by (e.status = 'finished') desc, e.time_ms asc nulls last, e.lane`,r=0;return{done:a.every(o=>o.status!=="racing"),entries:a.map(o=>({id:o.id,name:o.name,nationality:o.nationality,lane:o.lane,status:o.status,device:o.device,place:o.status==="finished"?++r:null,timeMs:o.time_ms,wpm:o.wpm===null?null:Number(o.wpm),accuracy:o.accuracy===null?null:Number(o.accuracy),reactionMs:o.reaction_ms,falseStart:o.false_start}))}}async function ke(){let e=await i`
    select * from (
      select b.ruleset_id, b.device, a.name, a.nationality, b.time_ms, b.wpm, b.achieved_at,
             row_number() over (partition by b.ruleset_id, b.device order by b.time_ms, b.achieved_at) as rank
      from typlympics.bests b join typlympics.athletes a on a.id = b.athlete_id
    ) ranked where rank <= 10 order by ruleset_id, device, rank`,t=await i`
    select * from (
      select a.name, a.nationality, b.wpm, b.ruleset_id, b.device,
             row_number() over (partition by b.device order by b.wpm desc, b.achieved_at) as rank
      from typlympics.bests b join typlympics.athletes a on a.id = b.athlete_id
    ) ranked where rank <= 10 order by device, rank`,n=await i`
    with ranked as (
      select athlete_id, rank() over (partition by race_id order by time_ms) as place, count(*) over (partition by race_id) as field
      from typlympics.race_entries where status = 'finished'
    )
    select a.name, a.nationality, count(*)::int as wins
    from ranked r join typlympics.athletes a on a.id = r.athlete_id
    where r.place = 1 and r.field >= 2
    group by a.id order by wins desc, a.name limit 10`,a={},r={};for(let s of e){let m=s.device==="phone"?r:a;(m[s.ruleset_id]??=[]).push({rank:Number(s.rank),name:s.name,nationality:s.nationality,timeMs:s.time_ms,wpm:Number(s.wpm),at:s.achieved_at})}let o=s=>({name:s.name,nationality:s.nationality,wpm:Number(s.wpm),rulesetId:s.ruleset_id});return{boards:a,phoneBoards:r,topSpeed:t.filter(s=>s.device!=="phone").map(o),phoneTopSpeed:t.filter(s=>s.device==="phone").map(o),mostWins:n}}function I(e){return{weekStart:e.week_start,rulesetId:e.ruleset_id,device:e.device,rank:e.rank,name:e.name,nationality:e.nationality,timeMs:e.time_ms}}async function Re(){await i`select typlympics.close_weeks()`;let e=await i`
    select to_char(date_trunc('week', now() at time zone 'utc'), 'YYYY-MM-DD') as week_start,
           extract(epoch from ((date_trunc('week', now() at time zone 'utc') + interval '7 days') - (now() at time zone 'utc'))) * 1000 as ends_in_ms`,t=await i`
    with best as (
      select r.ruleset_id, e.device, e.athlete_id, min(e.time_ms) as time_ms
      from typlympics.race_entries e join typlympics.races r on r.id = e.race_id
      where e.status = 'finished'
        and e.submitted_at >= (date_trunc('week', now() at time zone 'utc') at time zone 'utc')
      group by 1, 2, 3
    ),
    ranked as (
      select b.*, rank() over (partition by ruleset_id, device order by time_ms) as place from best b
    )
    select k.ruleset_id, k.device, k.place, k.time_ms, a.name, a.nationality
    from ranked k join typlympics.athletes a on a.id = k.athlete_id
    where k.place <= 10 order by k.ruleset_id, k.device, k.place, a.name`,n=await i`
    select to_char(m.week_start, 'YYYY-MM-DD') as week_start, m.ruleset_id, m.device, m.rank, m.time_ms, a.name, a.nationality
    from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
    where m.week_start = (select max(week_start) from typlympics.weekly_medals)
    order by m.ruleset_id, m.device, m.rank, a.name`,a={},r={};for(let s of t){let m=s.device==="phone"?r:a,d=(y[String(s.ruleset_id).split("@")[0]]?.distance??0)/5/(s.time_ms/6e4);(m[s.ruleset_id]??=[]).push({rank:Number(s.place),name:s.name,nationality:s.nationality,timeMs:s.time_ms,wpm:Math.round(d*100)/100})}let o=e[0];return{weekStart:o.week_start,endsInMs:Math.max(0,Math.round(Number(o.ends_in_ms))),boards:a,phoneBoards:r,lastWeek:n.length?{weekStart:n[0].week_start,medals:n.map(I)}:null}}async function ve(e){await i`select typlympics.close_weeks()`;let n=(await i`
    select distinct to_char(week_start, 'YYYY-MM') as month from typlympics.weekly_medals order by 1 desc`).map(m=>m.month),r=(typeof e.month=="string"&&/^[0-9]{4}-[0-9]{2}$/.test(e.month)?e.month:null)??n[0]??null,o=r?await i`
        select to_char(m.week_start, 'YYYY-MM-DD') as week_start, m.ruleset_id, m.device, m.rank, m.time_ms, a.name, a.nationality
        from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
        where to_char(m.week_start, 'YYYY-MM') = ${r}
        order by m.week_start desc, m.ruleset_id, m.device, m.rank, a.name`:[],s=await i`
    select a.name, a.nationality,
           count(*) filter (where m.rank = 1)::int as gold,
           count(*) filter (where m.rank = 2)::int as silver,
           count(*) filter (where m.rank = 3)::int as bronze
    from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
    group by a.id order by gold desc, silver desc, bronze desc, a.name limit 10`;return{months:n,month:r,medals:o.map(I),medalTable:s}}async function Me(e){let t=await p(e);await i`select typlympics.close_weeks()`;let n=await i`
    select to_char(m.week_start, 'YYYY-MM-DD') as week_start, m.ruleset_id, m.device, m.rank, m.time_ms, a.name, a.nationality
    from typlympics.weekly_medals m join typlympics.athletes a on a.id = m.athlete_id
    where m.athlete_id = ${t.id} order by m.week_start desc, m.rank limit 60`,a=r=>n.filter(o=>o.rank===r).length;return{gold:a(1),silver:a(2),bronze:a(3),medals:n.map(I)}}var Se={enter:me,host:ue,join:pe,room:we,leave:ye,start:he,tick:ge,submit:_e,results:be,records:ke,weekly:Re,hall:ve,myMedals:Me};function _(e,t){return new Response(JSON.stringify(t),{status:e,headers:{...B,"Content-Type":"application/json"}})}Deno.serve(async e=>{if(e.method==="OPTIONS")return new Response("ok",{headers:B});if(e.method!=="POST")return _(405,{error:{code:"method",message:"Use POST."}});try{let t=await e.json(),n=Se[String(t.action)];if(!n)throw new l("bad_action","Unknown action.");return _(200,{ok:!0,...await n(t)})}catch(t){return t instanceof l?_(t.status,{ok:!1,error:{code:t.code,message:t.message}}):(console.error("typlympics function error",t),_(500,{ok:!1,error:{code:"server",message:"Something went wrong on the server."}}))}});
