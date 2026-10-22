import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo, NO_YEAR, type PeopleRepo } from '@/lib/db/people';

let people: PeopleRepo;
let db: ReturnType<typeof createMemoryBackend>;

beforeEach(() => {
  db = createMemoryBackend({ now: () => new Date('2026-10-22T08:00:00Z') });
  people = createPeopleRepo(db);
});

async function person(name: string, birthday?: string) {
  const p = await people.upsertPersonByName(name);
  return birthday ? people.updatePerson(p.id, { birthday }) : p;
}

const brief = (rows: Awaited<ReturnType<PeopleRepo['upcomingDates']>>) =>
  rows.map((r) => [r.person.name, r.label, r.date, r.daysUntil, r.yearsSince]);

describe('people repo · fechas especiales (CRUD)', () => {
  it('addDate, listDates (por mes y día), updateDate y deleteDate', async () => {
    const ainhoa = await person('Ainhoa');
    const aniv = await people.addDate({ personId: ainhoa.id, label: ' Aniversario ', date: '2021-11-03' });
    expect(aniv).toMatchObject({ personId: ainhoa.id, label: 'Aniversario', date: '2021-11-03', yearly: true, notes: null });
    await people.addDate({ personId: ainhoa.id, label: 'Santo', date: '2000-01-21', notes: 'Santa Inés' });

    expect((await people.listDates(ainhoa.id)).map((d) => d.label)).toEqual(['Santo', 'Aniversario']);

    const up = await people.updateDate(aniv.id, { label: 'Boda', yearly: false, notes: 'En Bilbao' });
    expect(up).toMatchObject({ label: 'Boda', yearly: false, notes: 'En Bilbao', date: '2021-11-03' });

    await people.deleteDate(aniv.id);
    expect((await people.listDates(ainhoa.id)).map((d) => d.label)).toEqual(['Santo']);
  });

  it('rechaza etiqueta vacía y fechas no válidas', async () => {
    const p = await person('Eva');
    await expect(people.addDate({ personId: p.id, label: '  ', date: '2020-01-01' })).rejects.toThrow();
    await expect(people.addDate({ personId: p.id, label: 'Santo', date: '2021-02-29' })).rejects.toThrow();
    const d = await people.addDate({ personId: p.id, label: 'Santo', date: '2020-02-29' });
    await expect(people.updateDate(d.id, { label: '' })).rejects.toThrow();
    await expect(people.updateDate(d.id, { date: '31-12-2020' })).rejects.toThrow();
  });

  it('getPerson devuelve la persona o null', async () => {
    const p = await person('Luis');
    expect((await people.getPerson(p.id))?.name).toBe('Luis');
    expect(await people.getPerson('nope')).toBeNull();
  });
});

describe('people repo · upcomingDates', () => {
  it('une cumpleaños y fechas, hoy incluido, ordenado por días y con yearsSince', async () => {
    const ainhoa = await person('Ainhoa', '1991-10-22');
    await people.addDate({ personId: ainhoa.id, label: 'Aniversario', date: '2021-11-03' });
    const luis = await person('Luis', '1985-11-05');
    await people.addDate({ personId: luis.id, label: 'Santo', date: `${NO_YEAR}-10-25` });
    await person('Fuera', '1990-11-06');
    await person('Ayer', '1990-10-21');
    await person('Sin fecha');

    const res = await people.upcomingDates('2026-10-22', 14);

    expect(brief(res)).toEqual([
      ['Ainhoa', 'Cumpleaños', '2026-10-22', 0, 35],
      ['Luis', 'Santo', '2026-10-25', 3, undefined],
      ['Ainhoa', 'Aniversario', '2026-11-03', 12, 5],
      ['Luis', 'Cumpleaños', '2026-11-05', 14, 41],
    ]);
    expect(res[0].kind).toBe('birthday');
    expect(res[0].dateId).toBeNull();
    expect(res[2].kind).toBe('date');
    expect(res[2].dateId).toBeTruthy();
  });

  it('cruza el fin de año', async () => {
    const eva = await person('Eva', '2000-01-03');
    await people.addDate({ personId: eva.id, label: 'Nos conocimos', date: '2019-12-31' });
    await person('Enero8', '2000-01-08');
    await person('Enero9', '2000-01-09');
    const res = await people.upcomingDates('2026-12-25', 14);
    expect(brief(res)).toEqual([
      ['Eva', 'Nos conocimos', '2026-12-31', 6, 7],
      ['Eva', 'Cumpleaños', '2027-01-03', 9, 27],
      ['Enero8', 'Cumpleaños', '2027-01-08', 14, 27],
    ]);
  });

  it('el 29 de febrero cae el 28 en años no bisiestos (cumpleaños y fechas)', async () => {
    const p = await person('Bisiesto', '2000-02-29');
    await people.addDate({ personId: p.id, label: 'Aniversario', date: '2016-02-29' });

    expect(brief(await people.upcomingDates('2027-02-20', 14))).toEqual([
      ['Bisiesto', 'Aniversario', '2027-02-28', 8, 11],
      ['Bisiesto', 'Cumpleaños', '2027-02-28', 8, 27],
    ]);
    expect(brief(await people.upcomingDates('2028-02-20', 14))).toEqual([
      ['Bisiesto', 'Aniversario', '2028-02-29', 9, 12],
      ['Bisiesto', 'Cumpleaños', '2028-02-29', 9, 28],
    ]);
    // On 28 Feb of a non-leap year it is today.
    expect((await people.upcomingDates('2027-02-28', 0)).map((r) => r.daysUntil)).toEqual([0, 0]);
  });

  it('una fecha no anual solo sale su día; una anual no sale antes de su primera vez', async () => {
    const p = await person('Ana');
    await people.addDate({ personId: p.id, label: 'Viaje', date: '2026-10-30', yearly: false });
    await people.addDate({ personId: p.id, label: 'Viaje viejo', date: '2025-10-30', yearly: false });
    await people.addDate({ personId: p.id, label: 'Boda', date: '2027-10-24' });
    expect(brief(await people.upcomingDates('2026-10-22', 14))).toEqual([['Ana', 'Viaje', '2026-10-30', 8, undefined]]);
    // The first time itself has no "0 años".
    expect(brief(await people.upcomingDates('2027-10-22', 14))).toEqual([['Ana', 'Boda', '2027-10-24', 2, undefined]]);
  });

  it('rechaza una fecha de inicio no válida', async () => {
    await expect(people.upcomingDates('22/10/2026', 14)).rejects.toThrow();
  });
});
