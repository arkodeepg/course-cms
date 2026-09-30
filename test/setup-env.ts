import os from 'os';
import path from 'path';

// Keep tests hermetic: without this, lib/covers.ts would read the repo's real
// data/covers (fixture course ids match real ones). A directory that does not
// exist means "no generated covers"; tests that need some set COVERS_PATH.
process.env.COVERS_PATH = path.join(os.tmpdir(), 'course-cms-test-no-covers');
