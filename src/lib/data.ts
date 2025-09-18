import { Opportunity } from '@/lib/types';

// This is a mock database. In a real application, you would use a database.
let opportunities: Opportunity[] = [
  {
    id: '1',
    name: 'Global Innovators Scholarship',
    details: 'A prestigious scholarship for students with a passion for innovation and technology. Covers full tuition and a monthly stipend.',
    deadline: '2024-12-15',
    documentUri: 'https://picsum.photos/seed/101/800/1200',
    documentType: 'image',
  },
  {
    id: '2',
    name: 'PhD in Quantum Computing at Tech University',
    details: 'A fully-funded PhD position exploring the frontiers of quantum computing. Candidates should have a strong background in physics or computer science.',
    deadline: '2025-01-31',
    documentUri: 'data:application/pdf;base64,JVBERi0xLjQKJSDi48/JCjEgMCBvYmoKPDwKL1BhZ2VzIDIgMCBSCi9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9Db3VudCAxCi9LaWRzIFsgMyAwIFIgXQovVHlwZSAvUGFnZXMKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL01lZGlhQm94IFsgMCAwIDYxMiA3OTIgXQovUGFyZW50IDIgMCBSCi9SZXNvdXJjZXMgPDwKL0ZvbnQgPDwKL0YxIDQgMCBSCj4+Cj4+Ci9Db250ZW50cyA1IDAgUgovVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovQmFzZUZvbnQgL0hlbHZldGljYQovU3VidHlwZSAvVHlwZTEKL1R5cGUgL0ZvbnQKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0xlbmd0aCA1OAo+PgpzdHJlYW0KQk0KLzExLjI1ODYgVE0KNy41MDAwMiBUZgpCVCAvRjEgMTIgVGYgNzIgNzAwIFRkIChQaEQgRG9jdW1lbnQpIFRqIEVUCkVOZAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDYyIDAwMDAwIG4gCjAwMDAwMDAxMTIgMDAwMDAwIG4gCjAwMDAwMDAyNjAgMDAwMDAgbiAKMDAwMDAwMDM2NiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9Sb290IDEgMCBSCi9TaXplIDYKIDw+CnN0YXJ0eHJlZgo0NzYKJSVFT0YK',
    documentType: 'pdf',
  },
  {
    id: '3',
    name: 'CodeMasters Annual Programming Contest',
    details: 'Test your coding skills against the best programmers. Exciting prizes to be won, including cash and tech gadgets.',
    deadline: '2024-11-30',
    documentUri: 'data:text/plain;base64,Q29kZU1hc3RlcnMgQ29udGVzdCBSdWxlcy4uLg==',
    documentType: 'text',
  },
  {
    id: '4',
    name: 'Art & Design Fellowship',
    details: 'A one-year fellowship for emerging artists. Provides studio space, a grant, and a final exhibition.',
    documentUri: 'https://picsum.photos/seed/104/800/1200',
    documentType: 'image',
  },
];

// Simulate API latency
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getOpportunities(): Promise<Opportunity[]> {
  await delay(500);
  return opportunities;
}

export async function getOpportunityById(id: string): Promise<Opportunity | undefined> {
  await delay(200);
  return opportunities.find(op => op.id === id);
}

export async function saveOpportunity(opportunity: Opportunity): Promise<Opportunity> {
  await delay(1000);
  // This is where you'd insert into a database.
  // For this mock implementation, we just add it to the array.
  opportunities = [opportunity, ...opportunities];
  return opportunity;
}
