class ChunkingService {
    normalizeOptions(options = {}) {
        const maxChars = Math.max(20, parseInt(options.maxChars, 10) || 500);
        const minChars = Math.min(maxChars, Math.max(1, parseInt(options.minChars, 10) || 120));
        const overlap = Math.min(maxChars - 1, Math.max(0, parseInt(options.overlap, 10) || 80));

        return {
            maxChars,
            minChars,
            overlap
        };
    }

    normalizeText(text) {
        if (typeof text !== 'string') {
            return '';
        }

        return text
            .replace(/\r\n?/g, '\n')
            .replace(/\u00a0/g, ' ')
            .trim();
    }

    splitIntoParagraphs(text) {
        const normalizedText = this.normalizeText(text);
        if (!normalizedText) {
            return [];
        }

        return normalizedText
            .split(/\n\s*\n+/)
            .map((paragraph) => paragraph
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .join(' '))
            .map((paragraph) => paragraph.replace(/[ \t]+/g, ' ').trim())
            .filter(Boolean);
    }

    mergeParagraphs(paragraphs, options = {}) {
        const { maxChars, minChars } = this.normalizeOptions(options);
        const mergedChunks = [];
        let currentChunk = '';

        for (const paragraph of paragraphs) {
            if (!currentChunk) {
                currentChunk = paragraph;
                continue;
            }

            const combinedChunk = `${currentChunk}\n\n${paragraph}`;
            if (combinedChunk.length <= maxChars || currentChunk.length < minChars) {
                currentChunk = combinedChunk;
                continue;
            }

            mergedChunks.push(currentChunk);
            currentChunk = paragraph;
        }

        if (currentChunk) {
            if (currentChunk.length < minChars && mergedChunks.length > 0) {
                mergedChunks[mergedChunks.length - 1] = `${mergedChunks[mergedChunks.length - 1]}\n\n${currentChunk}`;
            } else {
                mergedChunks.push(currentChunk);
            }
        }

        return mergedChunks;
    }

    findSplitIndex(text, start, maxChars) {
        const idealEnd = Math.min(start + maxChars, text.length);
        const minimumEnd = start + Math.max(1, Math.floor(maxChars * 0.6));

        for (let index = idealEnd; index > minimumEnd; index--) {
            if (/[。！？；!?;.!]/.test(text[index - 1])) {
                return index;
            }
        }

        for (let index = idealEnd; index > minimumEnd; index--) {
            if (/\s/.test(text[index - 1])) {
                return index;
            }
        }

        return idealEnd;
    }

    splitLongChunk(text, options = {}) {
        const normalizedText = this.normalizeText(text);
        if (!normalizedText) {
            return [];
        }

        const { maxChars, overlap } = this.normalizeOptions(options);
        if (normalizedText.length <= maxChars) {
            return [normalizedText];
        }

        const chunks = [];
        let start = 0;

        while (start < normalizedText.length) {
            const remaining = normalizedText.length - start;
            if (remaining <= maxChars) {
                const tailChunk = normalizedText.slice(start).trim();
                if (tailChunk) {
                    chunks.push(tailChunk);
                }
                break;
            }

            const end = this.findSplitIndex(normalizedText, start, maxChars);
            const chunk = normalizedText.slice(start, end).trim();
            if (chunk) {
                chunks.push(chunk);
            }

            if (end >= normalizedText.length) {
                break;
            }

            start = Math.max(end - overlap, start + 1);
            while (start < normalizedText.length && /\s/.test(normalizedText[start])) {
                start++;
            }
        }

        return chunks;
    }

    splitText(text, options = {}) {
        const paragraphs = this.splitIntoParagraphs(text);
        if (paragraphs.length === 0) {
            return [];
        }

        const mergedChunks = this.mergeParagraphs(paragraphs, options);
        return mergedChunks
            .flatMap((chunk) => this.splitLongChunk(chunk, options))
            .map((chunk) => chunk.trim())
            .filter(Boolean);
    }

    buildKnowledgeItems({ userId = null, source = 'admin-import', text = '', options = {} } = {}) {
        return this.splitText(text, options).map((content) => ({
            user_id: userId || null,
            source: source || 'admin-import',
            content
        }));
    }
}

module.exports = new ChunkingService();
