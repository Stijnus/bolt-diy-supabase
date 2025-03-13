import { executeDatabaseAction } from '~/lib/actions/database-actions';

export async function handleAction(action: BoltAction): Promise<any> {
  switch (action.type) {
    case 'database':
      return await executeDatabaseAction(action);

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}
