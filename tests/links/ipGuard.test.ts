import { describe, expect, it } from 'vitest';
import { checkFetchUrl, isPublicAddress } from '@/lib/links/ipGuard';

describe('isPublicAddress', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.10',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.5',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:10.1.2.3',
    '64:ff9b::a9fe:a9fe',
    '2001:db8::1',
    '2002:c0a8:0101::1',
    '2001:0:4136:e378::1',
    '::127.0.0.1',
    '0:0:0:0:0:0:0:1',
  ])('rechaza %s (privada, loopback, link-local o reservada)', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '93.184.216.34', '2a00:1450:4003:80f::200e', '2606:4700::1111', '::ffff:8.8.8.8'])(
    'acepta %s (pública)',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it('rechaza lo que no es una IP', () => {
    for (const s of ['', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', '01.2.3.4', 'gggg::1', '1::2::3']) {
      expect(isPublicAddress(s)).toBe(false);
    }
  });
});

describe('checkFetchUrl', () => {
  it('solo http y https, sin credenciales y en los puertos de siempre', () => {
    expect(checkFetchUrl('https://ejemplo.com/a')?.hostname).toBe('ejemplo.com');
    expect(checkFetchUrl('http://ejemplo.com:80/a')).not.toBeNull();
    expect(checkFetchUrl('https://ejemplo.com:443/a')).not.toBeNull();
    for (const bad of [
      'ftp://ejemplo.com',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'gopher://x.com',
      'https://user:pw@ejemplo.com',
      'http://ejemplo.com:8080/',
      'http://ejemplo.com:22/',
      'no es url',
    ]) {
      expect(checkFetchUrl(bad)).toBeNull();
    }
  });

  it('una IP literal privada se rechaza sin resolver DNS', () => {
    expect(checkFetchUrl('http://127.0.0.1/')).toBeNull();
    expect(checkFetchUrl('http://[::1]/')).toBeNull();
    expect(checkFetchUrl('http://169.254.169.254/latest/meta-data')).toBeNull();
    expect(checkFetchUrl('http://0x7f.1/')).toBeNull();
    expect(checkFetchUrl('http://8.8.8.8/')).not.toBeNull();
  });

  it('nombres locales se rechazan', () => {
    expect(checkFetchUrl('http://localhost/')).toBeNull();
    expect(checkFetchUrl('http://foo.localhost/')).toBeNull();
    expect(checkFetchUrl('http://router.local/')).toBeNull();
    expect(checkFetchUrl('http://intranet/')).toBeNull();
  });
});
