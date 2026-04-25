// Configuración global de la aplicación

export const APP_VERSION = '2.0.0';

export const GDRIVE_CLIENT_ID = '742085025396-7s3k6evr07j9m329ljquucv7mk1qijnn.apps.googleusercontent.com';
export const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile';
export const GDRIVE_FILENAME = 'sql-query-manager-backup.json';

export const STORAGE_KEY = 'sqlqm-alldata';
export const DRIVE_FILEID_KEY = 'sqlqm-drive-fileid';
export const DRIVE_USER_KEY = 'sqlqm-drive-user';

export const DEFAULT_CATEGORIES = ['General', 'Reportes', 'Mantenimiento', 'Auditoría', 'Consultas frecuentes'];
export const DEFAULT_DATABASES = ['Oracle_Prod', 'MySQL_Dev', 'PostgreSQL_Analytics'];

// Límites
export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;   // 5 MB
export const MAX_BATCH_FILE_SIZE = 10 * 1024 * 1024;   // 10 MB
export const SEARCH_DEBOUNCE_MS = 180;
export const DRIVE_SYNC_DEBOUNCE_MS = 1500;

// Sort
export const SORT_OPTIONS = [
  { field: 'createdAt', label: 'Fecha' },
  { field: 'name', label: 'Nombre' },
  { field: 'category', label: 'Categoría' },
];

// SQL keywords para highlighting
export const SQL_KEYWORDS = new Set([
  'SELECT','FROM','WHERE','INSERT','INTO','VALUES','UPDATE','SET','DELETE','CREATE','TABLE','DROP','ALTER','ADD','COLUMN','INDEX','VIEW',
  'JOIN','INNER','LEFT','RIGHT','OUTER','CROSS','ON','AND','OR','NOT','IN','BETWEEN','LIKE','IS','NULL','AS',
  'ORDER','BY','GROUP','HAVING','DISTINCT','LIMIT','OFFSET','UNION','ALL','EXISTS','CASE','WHEN','THEN','ELSE','END',
  'COUNT','SUM','AVG','MIN','MAX','WITH','RECURSIVE','OVER','PARTITION','ROW_NUMBER','RANK','DENSE_RANK',
  'FETCH','NEXT','ROWS','ONLY','TOP','DESC','ASC','PRIMARY','KEY','FOREIGN','REFERENCES','CONSTRAINT','DEFAULT','CHECK',
  'UNIQUE','CASCADE','TRUNCATE','MERGE','USING','MATCHED','BEGIN','COMMIT','ROLLBACK','TRANSACTION',
  'GRANT','REVOKE','EXEC','EXECUTE','PROCEDURE','FUNCTION','TRIGGER','DECLARE','CURSOR','OPEN','CLOSE','DEALLOCATE',
  'IF','WHILE','RETURN','PRINT','GO','USE','DATABASE','SCHEMA','COALESCE','IFNULL','NVL','CAST','CONVERT',
  'SUBSTRING','REPLACE','TRIM','UPPER','LOWER','LENGTH','CHAR_LENGTH','CONCAT','DATE','YEAR','MONTH','DAY',
  'HOUR','MINUTE','SECOND','NOW','GETDATE','SYSDATE','DUAL','ROWNUM','LEVEL','CONNECT','START','PRIOR',
  'MINUS','INTERSECT','EXCEPT','PIVOT','UNPIVOT','LATERAL','LAG','LEAD','FIRST_VALUE','LAST_VALUE','NTH_VALUE',
  'NTILE','PERCENT_RANK','CUME_DIST','LISTAGG','STRING_AGG','GROUP_CONCAT','BOOLEAN','INT','INTEGER','BIGINT',
  'SMALLINT','FLOAT','DOUBLE','DECIMAL','NUMERIC','VARCHAR','CHAR','TEXT','BLOB','CLOB','TIMESTAMP','DATETIME',
  'NUMBER','VARCHAR2','NVARCHAR','NCHAR','TRUE','FALSE','TEMPORARY','TEMP','MATERIALIZED','EXPLAIN','ANALYZE',
]);
