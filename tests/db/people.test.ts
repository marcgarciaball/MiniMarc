import { describe, expect, it } from 'vitest';
import { createMemoryBackend } from '@/lib/db/memory';
import { createPeopleRepo } from '@/lib/db/people';

function setup() {
  const backend = createMemoryBackend();
  return { backend, people: createPeopleRepo(backend) };
}

describe('upsertPersonByName: la misma persona, escrita de otra manera', () => {
  it.each([
    ['con acento donde no lo había', 'Mama', 'mamá'],
    ['sin acento donde lo había', 'mamá', 'Mama'],
    ['en mayúsculas', 'Ainhoa', 'AINHOA'],
    ['con espacios de más', 'Ana', '  Ana  '],
    ['con espacios dobles dentro', 'Ana María', 'Ana  María'],
  ])('%s', async (_name, first, second) => {
    const { people } = setup();
    const a = await people.upsertPersonByName(first);
    const b = await people.upsertPersonByName(second);
    expect(b.id).toBe(a.id);
    expect((await people.listPeople())).toHaveLength(1);
  });

  it('conserva el nombre con el que se creó, no lo reescribe', async () => {
    const { people } = setup();
    await people.upsertPersonByName('mamá');
    const again = await people.upsertPersonByName('MAMA');
    expect(again.name).toBe('mamá');
  });

  it('nombres distintos siguen siendo personas distintas', async () => {
    const { people } = setup();
    const ana = await people.upsertPersonByName('Ana');
    const ano = await people.upsertPersonByName('Ano');
    expect(ano.id).not.toBe(ana.id);
    expect(await people.listPeople()).toHaveLength(2);
  });

  it('un nombre vacío o solo espacios lanza', async () => {
    const { people } = setup();
    await expect(people.upsertPersonByName('   ')).rejects.toThrow();
  });
});
