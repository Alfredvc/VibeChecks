# Vibe Checks VSCode Extension Makefile

# Variables
EXTENSION_NAME = vibe-checks
EXTENSION_DIR = ~/.vscode/extensions/$(EXTENSION_NAME)-dev
BUILD_DIR = out
NODE_MODULES = node_modules

# Default target
.PHONY: all
all: build

# Install dependencies
.PHONY: deps
deps:
	@echo "📦 Installing dependencies..."
	npm install

# Build the extension
.PHONY: build
build: deps
	@echo "🔨 Building extension..."
	npm run compile

# Install extension to VSCode
.PHONY: install
install: build
	@echo "🚀 Installing Vibe Checks extension to VSCode..."
	@# Create the extension directory if it doesn't exist
	@mkdir -p $(EXTENSION_DIR)
	@# Copy all necessary files
	@echo "📂 Copying files to $(EXTENSION_DIR)..."
	@cp -r $(BUILD_DIR) $(EXTENSION_DIR)/
	@cp package.json $(EXTENSION_DIR)/
	@cp README.md $(EXTENSION_DIR)/
	@# Copy node_modules if they exist (optional dependencies)
	@if [ -d "$(NODE_MODULES)" ]; then \
		echo "📦 Copying node_modules..."; \
		cp -r $(NODE_MODULES) $(EXTENSION_DIR)/; \
	fi
	@echo "✅ Extension installed successfully!"
	@echo "💡 Restart VSCode or reload the window to activate the extension."

# Remove extension from VSCode
.PHONY: remove
remove:
	@echo "🗑️  Removing Vibe Checks extension from VSCode..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		rm -rf $(EXTENSION_DIR); \
		echo "✅ Extension removed successfully!"; \
		echo "💡 Restart VSCode or reload the window to complete removal."; \
	else \
		echo "⚠️  Extension directory not found at $(EXTENSION_DIR)"; \
		echo "   Extension may not be installed or already removed."; \
	fi

# Clean build artifacts
.PHONY: clean
clean:
	@echo "🧹 Cleaning build artifacts..."
	@rm -rf $(BUILD_DIR)
	@rm -rf $(NODE_MODULES)
	@echo "✅ Clean complete!"

# Watch for changes during development
.PHONY: watch
watch: deps
	@echo "👀 Watching for changes..."
	npm run watch

# Development mode - runs extension in debug mode
.PHONY: dev
dev: build
	@echo "🚀 Starting extension in development mode..."
	@echo "💡 This will open a new VSCode window with the extension loaded."
	@echo "   Press F5 in VSCode to start debugging, or use 'code --extensionDevelopmentPath=.'"
	code --extensionDevelopmentPath=.

# Reinstall - remove and install in one command
.PHONY: reinstall
reinstall: remove install

# Package extension as VSIX (requires vsce)
.PHONY: package
package: build
	@echo "📦 Packaging extension as VSIX..."
	@if ! command -v vsce >/dev/null 2>&1; then \
		echo "❌ vsce not found. Installing..."; \
		npm install -g vsce; \
	fi
	vsce package
	@echo "✅ VSIX package created!"

# Check if extension is installed
.PHONY: status
status:
	@echo "🔍 Checking extension installation status..."
	@if [ -d "$(EXTENSION_DIR)" ]; then \
		echo "✅ Extension is installed at $(EXTENSION_DIR)"; \
		echo "📊 Files in extension directory:"; \
		ls -la $(EXTENSION_DIR); \
	else \
		echo "❌ Extension is not installed"; \
	fi

# Show help
.PHONY: help
help:
	@echo "Vibe Checks Extension Makefile"
	@echo ""
	@echo "Available targets:"
	@echo "  deps        - Install npm dependencies"
	@echo "  build       - Compile TypeScript and build extension"
	@echo "  install     - Build and install extension to VSCode"
	@echo "  remove      - Remove extension from VSCode"
	@echo "  reinstall   - Remove and reinstall extension"
	@echo "  clean       - Clean build artifacts and node_modules"
	@echo "  watch       - Watch for changes during development"
	@echo "  dev         - Start extension in development mode"
	@echo "  package     - Create VSIX package"
	@echo "  status      - Check if extension is installed"
	@echo "  help        - Show this help message"
	@echo ""
	@echo "Quick start:"
	@echo "  make install    # Build and install extension"
	@echo "  make remove     # Remove extension"
	@echo ""
	@echo "Extension will be installed to: $(EXTENSION_DIR)"