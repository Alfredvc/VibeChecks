// Utility to parse and filter git status --porcelain output for Vibe Checks
export interface GitStatusFile {
    status: string;
    filename: string;
}

/**
 * Returns files that are:
 * 1. Tracked and unstaged (XY = ' M', 'MM', 'AM', etc. where X != '?' and Y != '?')
 * 2. Tracked and staged (X != ' ')
 * 3. New but staged (X == 'A')
 * Excludes files that are untracked and unstaged (XY == '??')
 */
export function getVibeCheckCandidatesFromGitStatus(statusOutput: string): GitStatusFile[] {
    const lines = statusOutput.split('\n').filter(line => line.trim());
    return lines
        .map(line => ({
            status: line.substring(0, 2),
            filename: line.substring(3)
        }))
        .filter(file => {
            const [X, Y] = file.status;
            // Exclude untracked and unstaged
            if (file.status === '??') return false;
            // Include if staged (X != ' ')
            if (X !== ' ') return true;
            // Include if tracked and unstaged (Y != ' ')
            if (Y !== ' ') return true;
            return false;
        });
}
