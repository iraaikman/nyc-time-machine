import test from 'node:test';
import assert from 'node:assert/strict';
import { captionStreets, createArchive, decadeCounts, filterDecade, searchStreets, datedPhoto } from '../src/archive.js';
import { loadFavourites, validateFavourites, serialiseFavourites, KEY } from '../src/favourites.js';
const photo = (id,title,year,lat=40.7,lon=-74) => ({id,title,year,lat,lon,text:''});

test('street aliases normalize while boroughs, East/West and numbered streets stay distinct', () => {
  const a = captionStreets('Manhattan: 5th Ave. - 23rd Street (East)');
  assert.deepEqual(a.map(s => s.key), ['manhattan|5 avenue','manhattan|east 23 street']);
  assert.equal(captionStreets('Manhattan: Fifth Avenue - East 23rd St.')[1].key,a[1].key);
  assert.notEqual(captionStreets('Brooklyn: 5th Avenue - 23rd Street')[0].key,a[0].key);
  assert.notEqual(captionStreets('Manhattan: 5th Avenue - 23rd Street (West)')[1].key,a[1].key);
  assert.equal(captionStreets('Manhattan: Central Park West, west side btw. 72nd Street and 73rd Street.')[0].label,'Central Park West');
  assert.deepEqual(captionStreets('A house on a street in New York'),[]);
  assert.deepEqual(captionStreets('Brooklyn: Golden City Park.'),[]);
});

test('street index includes co-located archive photos, without mixing boroughs or duplicating an intersection', () => {
  const photos = [
    photo('1','Manhattan: Broadway - Grand Street',1935),
    photo('2','A shop at this corner',1910),
    photo('3','Manhattan: Broadway - Broadway',null),
    photo('4','Brooklyn: Broadway - Grand Street',1920,40.72,-73.95),
    photo('5','Manhattan: West Broadway - Grand Street',1930,40.72,-74.01),
  ];
  const a = createArchive(photos);
  assert.deepEqual(a.streets.get('manhattan|broadway').photos.map(p=>p.id),['2','1','3']);
  assert.deepEqual(a.streets.get('brooklyn|broadway').photos.map(p=>p.id),['4']);
  assert.equal(a.byId.size,5);
  assert.deepEqual(photos.map(p=>p.id),['1','2','3','4','5']);
});

test('timeline includes outlying decades, preserves chronological order and isolates undated photos', () => {
  const a = createArchive([photo('3','Manhattan: Bowery - Grand Street',null),photo('2','Manhattan: Bowery - Grand Street',1981),photo('1','Manhattan: Bowery - Grand Street',1849)]);
  assert.deepEqual(decadeCounts(a.photos),[['1840',1],['1980',1],['undated',1]]);
  assert.deepEqual(filterDecade(a.photos,'undated').map(p=>p.id),['3']);
  assert.deepEqual(filterDecade(a.photos,'1980').map(p=>p.id),['2']);
  assert.equal(filterDecade(a.photos,'all').length,3);
});

test('street search understands spelled-out numbers and borough-qualified queries', () => {
  const a = createArchive([photo('1','Manhattan: 5th Avenue - 23rd Street (East)',1920),photo('2','Brooklyn: 5th Avenue - 23rd Street',1930,40.6,-74)]);
  assert.deepEqual(searchStreets(a,'fifth ave manhattan').map(s=>s.key),['manhattan|5 avenue']);
  assert.deepEqual(searchStreets(a,'east 23rd').map(s=>s.key),['manhattan|east 23 street']);
  assert.deepEqual(searchStreets(a,''),[]);
});

test('clear closing datelines override historical years, with provenance; ambiguous prose is left alone', () => {
  const p={...photo('1','Manhattan: 5th Avenue - 13th Street',1850),text:'A house was built about 1850.\n\nMarch 28, 1938.\n\nP. L. Sperr.'};
  const result=datedPhoto(p);
  assert.equal(result.year,1938);
  assert.equal(result.archiveYear,1850);
  assert.equal(result.dateSource,'transcription');
  assert.equal(p.year,1850);
  assert.equal(datedPhoto({...p,text:'The street changed in March 1938. It began in 1850.'}).year,1850);
  assert.equal(datedPhoto({...p,text:'June 1, 1920.\nJune 1, 1930.'}).year,1850);
});

test('previous alignments migrate to photo favourites; the new store takes precedence', () => {
  const byId=new Map([['1',{}],['2',{}]]);
  const data=new Map([['nyc-time-machine:alignments:v1',JSON.stringify([{photoId:'1'},{photoId:'1'},{photoId:'missing'}])]]);
  const storage={getItem:key=>data.get(key)??null};
  assert.deepEqual(loadFavourites(storage,byId).ids,['1']);
  data.set(KEY,serialiseFavourites(new Set(['2'])));
  assert.deepEqual(loadFavourites(storage,byId).ids,['2']);
  data.set(KEY,'{bad json');
  assert.match(loadFavourites(storage,byId).message,/could not be read/);
});

test('favourites backups preserve IDs, merge duplicates, and reject unknown or malformed records', () => {
  const byId=new Map([['1',{}],['2',{}]]);
  assert.deepEqual(validateFavourites(JSON.parse(serialiseFavourites(new Set(['1','2']))),byId),['1','2']);
  assert.deepEqual(validateFavourites({version:1,pairs:[{photoId:'1'},{photoId:'1'}]},byId),['1']);
  for (const data of [{version:2,type:'historic-photos',photoIds:['missing']},{version:2,type:'historic-photos',photoIds:[1]},{version:1,pairs:[null]},{version:3,photoIds:['1']}]) assert.throws(()=>validateFavourites(data,byId),/backup/);
});
