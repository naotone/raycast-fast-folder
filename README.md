# Fast Folder Access

A Raycast extension for quickly accessing frequently used folders with intelligent search and history management.

## Features

🚀 **Smart Search**: Dynamic folder search with real-time scoring and progressive loading
🧠 **Intelligent History**: Automatically tracks and prioritizes frequently accessed folders
📊 **Advanced Scoring**: Sophisticated matching algorithm that scores results based on:

- Exact matches (100 points)
- Prefix matches (90 points)
- Word boundary matches (80 points)
- Contains matches (70 points)
- Fuzzy matches (50-60 points)
- Recent access bonus (+20 points)
- Depth penalty (-5 points per level)

⚡ **Progressive Loading**: Shows results as they're found for faster perceived performance
🔧 **Configurable**: Extensive preferences for customizing search behavior

## Installation

1. Clone this repository
2. Run `npm install` or `pnpm install`
3. Run `npm run dev` to start development mode
4. Open Raycast and search for "Search Folders"

## Usage

### Search and Navigation

- **Type to search**: Start typing to find folders dynamically
- **Progressive results**: Results appear as they're found
- **Smart scoring**: Results ranked by relevance and recent usage

### Keyboard Shortcuts

- **⌘O**: Open folder in Finder
- **⏎ Enter** or **⌘→**: Navigate forward into folder
- **⌘←**: Navigate Back
- **⌃R**: Add to recent folders
- **⌃X**: Remove from recent (recent items only)
- **⌘C**: Copy folder path to clipboard

### Folder Types

- **🕐 Recent**: Previously accessed folders (shown first)
- **🏠 Parent**: Configured search directories
- **📂 Search**: Found folders matching your query

## Configuration

### Preferences

- **Search Directories**: Comma-separated list of directories to search
- **Max History Items**: Number of recent folders to remember (default: 10)
- **Search Depth**: How deep to search in subdirectories (1-5 levels)
- **Max Search Results**: Maximum folders to display (default: 100)
- **Search Delay**: Debounce delay before starting search (100-500ms)
- **Enable Fuzzy Matching**: Allow fuzzy search (e.g., 'proj' matches 'project')
- **Prioritize Recent Folders**: Boost recent folders in search rankings

### Search Algorithm

The extension uses a sophisticated scoring system:

1. **Base Scoring**:

   - Exact match: 100 points
   - Starts with query: 90 points
   - Word boundary match: 80 points
   - Contains query: 70 points
   - Fuzzy match: 50-60 points

2. **Bonuses & Penalties**:

   - Recent folder bonus: +20 points
   - Depth penalty: -5 points per directory level
   - Minimum score: 1 point

3. **Progressive Search**:
   - Stage 1: Search immediate children (depth 1)
   - Stage 2: Search deeper levels if configured
   - Results shown as they're found

## Development

```bash
# Install dependencies
npm install

# Start development mode
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Fix lint issues
npm run fix-lint
```

## Technical Details

### Architecture

- **React Hooks**: Uses modern React patterns with hooks
- **Local Storage**: Persistent history management
- **Async Search**: Non-blocking progressive search
- **Smart Caching**: Efficient result caching and deduplication

### Performance Features

- **Debounced Search**: Prevents excessive searches while typing
- **Batch Processing**: Results processed in batches for smooth UI
- **Path Validation**: Automatic cleanup of invalid history entries
- **Search Cancellation**: Previous searches cancelled when new ones start

### File Structure

```
src/
├── search-folders.tsx    # Main component with search logic
└── ...

package.json             # Extension configuration and dependencies
README.md               # This file
.gitignore             # Git ignore patterns
```

## License

MIT License - see package.json for details

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Author

naotone

---

For more information about Raycast extensions, visit [Raycast Developers](https://developers.raycast.com/).
