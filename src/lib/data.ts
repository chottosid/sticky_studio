import { Opportunity } from '@/lib/types';
import { query } from './db';

export async function getOpportunities(
  page: number = 1, 
  limit: number = 10, 
  sortBy: string = 'created_at',
  sortOrder: 'ASC' | 'DESC' = 'DESC',
  searchQuery?: string
): Promise<{ opportunities: Opportunity[], total: number, hasMore: boolean }> {
  try {
    const offset = (page - 1) * limit;
    
    // Build WHERE clause for search
    let whereClause = '';
    let queryParams: any[] = [];
    let paramCount = 0;
    
    if (searchQuery && searchQuery.trim()) {
      const searchTerm = searchQuery.trim();
      whereClause = `WHERE (
        name ILIKE $${++paramCount} OR 
        details ILIKE $${++paramCount} OR 
        COALESCE(deadline::text, '') ILIKE $${++paramCount}
      )`;
      queryParams.push(`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`);
    }
    
    // Validate and sanitize sortBy to prevent SQL injection
    const validSortColumns = ['created_at', 'deadline', 'name', 'id'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';
    
    // Handle deadline sorting with nulls
    let orderByClause = '';
    if (safeSortBy === 'deadline') {
      orderByClause = `ORDER BY ${safeSortBy} ${safeSortOrder} NULLS LAST`;
    } else {
      orderByClause = `ORDER BY ${safeSortBy} ${safeSortOrder}`;
    }
    
    // Get total count
    const countResult = await query(`
      SELECT COUNT(*) as total FROM opportunities ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].total);
    
    // Get paginated results
    const result = await query(`
      SELECT id, name, details, deadline, document_uri as "documentUri", document_type as "documentType", created_at
      FROM opportunities 
      ${whereClause}
      ${orderByClause}
      LIMIT $${++paramCount} OFFSET $${++paramCount}
    `, [...queryParams, limit, offset]);
    
    const opportunities = result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      details: row.details,
      deadline: row.deadline ? (typeof row.deadline === 'string' ? row.deadline : new Date(row.deadline).toISOString().split('T')[0]) : null,
      documentUri: row.documentUri,
      documentType: row.documentType,
      created_at: row.created_at,
    }));
    
    return {
      opportunities,
      total,
      hasMore: page * limit < total
    };
  } catch (error) {
    console.error('Error fetching opportunities:', error);
    return { opportunities: [], total: 0, hasMore: false };
  }
}

// Keep the old function for backward compatibility but deprecate it
export async function getAllOpportunities(): Promise<Opportunity[]> {
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

export async function deleteOpportunity(id: string): Promise<boolean> {
  try {
    const result = await query(`
      DELETE FROM opportunities 
      WHERE id = $1
      RETURNING id
    `, [id]);
    
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error deleting opportunity:', error);
    throw error;
  }
}

export async function updateOpportunity(id: string, opportunity: Partial<Omit<Opportunity, 'id'>>): Promise<Opportunity | null> {
  try {
    // Build dynamic update query
    const updateFields = [];
    const values = [];
    let paramCount = 0;

    if (opportunity.name !== undefined) {
      updateFields.push(`name = $${++paramCount}`);
      values.push(opportunity.name);
    }
    
    if (opportunity.details !== undefined) {
      updateFields.push(`details = $${++paramCount}`);
      values.push(opportunity.details);
    }
    
    if (opportunity.deadline !== undefined) {
      updateFields.push(`deadline = $${++paramCount}`);
      values.push(opportunity.deadline && opportunity.deadline.trim() !== '' ? opportunity.deadline : null);
    }
    
    if (opportunity.documentUri !== undefined) {
      updateFields.push(`document_uri = $${++paramCount}`);
      values.push(opportunity.documentUri);
    }
    
    if (opportunity.documentType !== undefined) {
      updateFields.push(`document_type = $${++paramCount}`);
      values.push(opportunity.documentType);
    }

    if (updateFields.length === 0) {
      throw new Error('No fields to update');
    }

    // Add updated_at timestamp
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add ID parameter
    values.push(id);

    const result = await query(`
      UPDATE opportunities 
      SET ${updateFields.join(', ')}
      WHERE id = $${++paramCount}
      RETURNING id, name, details, deadline, document_uri as "documentUri", document_type as "documentType", created_at
    `, values);
    
    if (result.rows.length === 0) {
      return null;
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
    console.error('Error updating opportunity:', error);
    throw error;
  }
}
