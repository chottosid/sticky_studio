import { describe, expect, it } from 'vitest';
import { cleanOrganizationName, organizationKey, professorKey } from './organizations';

const same = (...names: string[]) => expect(new Set(names.map(organizationKey)).size).toBe(1);

describe('organizationKey', () => {
  it('folds department suffixes, abbreviations and articles into one university', () => {
    same('Stanford University', 'Stanford University, Department of Computer Science');
    same('University of California, Berkeley', 'UC Berkeley', 'Univ. of California - Berkeley', 'University of California, Berkeley, EECS');
    same('University of Illinois Urbana-Champaign', 'University of Illinois at Urbana Champaign', 'University of Illinois Urbana-Champaign (Siebel School)');
    same('The University of Texas at Dallas', 'University of Texas at Dallas');
    same('Massachusetts Inst. of Technology', 'Massachusetts Institute of Technology', 'MIT');
    same('University of Maryland - College Park', 'University of Maryland, College Park, Department of Computer Science', 'Univ. of Maryland - College Park');
    same('Johns Hopkins University', 'Johns Hopkins University, Applied Mathematics & Statistics', 'Johns Hopkins University, Department of Computer Science');
    same('New York University', 'NYU Center for Data Science', 'New York University, Computer Science');
    same('Georgia Institute of Technology', 'Georgia Institute of Technology, Machine Learning Center');
    same('Rutgers University', 'Rutgers University-New Brunswick, Department of Computer Science');
    same('University of California, Berkeley', 'UC Berkeley Center for Long-Term Cybersecurity');
    same('NJIT', 'New Jersey Institute of Technology, Department of Computer Science');
  });

  it('keeps different places apart', () => {
    expect(organizationKey('Texas A&M University')).not.toBe(organizationKey('Texas A&M University-Corpus Christi'));
    expect(organizationKey('University of California, Berkeley')).not.toBe(organizationKey('University of California, Davis'));
    expect(organizationKey('University of Edinburgh')).not.toBe(organizationKey('University of Oxford'));
  });

  it('returns an empty key for blank input', () => expect(organizationKey('  ')).toBe(''));
});

describe('cleanOrganizationName', () => {
  it('keeps the place part, including a comma that belongs to the name', () => {
    expect(cleanOrganizationName('University of California, Davis, Department of Computer Science')).toBe('University of California, Davis');
    expect(cleanOrganizationName('Pennsylvania State University, College of Information Sciences and Technology')).toBe('Pennsylvania State University');
  });
});

describe('professorKey', () => {
  it('ignores titles and punctuation', () => {
    expect(professorKey('Prof. Jakob Foerster')).toBe(professorKey('jakob  foerster'));
  });
});
