import { Opportunity } from '@/lib/types';
import { query } from './db';

export async function getOpportunities(): Promise<Opportunity[]> {
  try {
    const result = await query(`
      SELECT id, name, details, deadline, document_uri as "documentUri", document_type as "documentType", created_at
      FROM opportunities 
      ORDER BY created_at DESC
    `);
    
    return result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      details: row.details,
      deadline: row.deadline ? (typeof row.deadline === 'string' ? row.deadline : new Date(row.deadline).toISOString().split('T')[0]) : null,
      documentUri: row.documentUri,
      documentType: row.documentType,
      created_at: row.created_at,
    }));
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return [];
  }
}

export async function getOpportunityById(id: string): Promise<Opportunity | undefined> {
  try {
    const result = await query(`
      SELECT id, name, details, deadline, document_uri as "documentUri", document_type as "documentType", created_at
      FROM opportunities 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return undefined;
    }
    
    const row = result.rows[0];
    return {
      id: row.id.toString(),
      name: row.name,
      details: row.details,
      deadline: row.deadline ? (typeof row.deadline === 'string' ? row.deadline : new Date(row.deadline).toISOString().split('T')[0]) : null,
      documentUri: row.documentUri,
      documentType: row.documentType,
      created_at: row.created_at,
    };
  } catch (error) {
    console.error('Error fetching opportunity by ID:', error);
    return undefined;
  }
}

export async function saveOpportunity(opportunity: Omit<Opportunity, 'id'>): Promise<Opportunity> {
  try {
    // Convert empty string deadline to null for PostgreSQL
    const deadline = opportunity.deadline && opportunity.deadline.trim() !== '' 
      ? opportunity.deadline 
      : null;

    const result = await query(`
      INSERT INTO opportunities (name, details, deadline, document_uri, document_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, details, deadline, document_uri as "documentUri", document_type as "documentType"
    `, [
      opportunity.name,
      opportunity.details,
      deadline,
      opportunity.documentUri,
      opportunity.documentType,
    ]);
    
    const row = result.rows[0];
    return {
      id: row.id.toString(),
      name: row.name,
      details: row.details,
      deadline: row.deadline ? (typeof row.deadline === 'string' ? row.deadline : new Date(row.deadline).toISOString().split('T')[0]) : null,
      documentUri: row.documentUri,
      documentType: row.documentType,
    };
  } catch (error) {
    console.error('Error saving opportunity:', error);
    throw error;
  }
}
