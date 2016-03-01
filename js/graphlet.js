(function() {
	var MARGIN = {L: 30, T: 30, B: 40, R: 120};
	var nodeMap;
	var nodes;
	var links;
	var graph;

	var dateFormat = d3.time.format('%Y-%m-%d');
	var dateFormatYear = d3.time.format('%Y');

	var genderColorScale = d3.scale.ordinal()
		.domain(['M', 'F'])
		.range(['#1f77b4', '#d62728']);
	var relColorScale = d3.scale.ordinal()
		.domain(['child', 'spouse'])
		.range(['#666666', '#d62728']);

	function main() {
		var els = document.querySelectorAll('a.graphlet');
		var loader = queue();
		loader.defer(d3.csv, '/nodes.csv');
		loader.defer(d3.csv, '/links.csv');

		for(var i = 0; i < els.length; i++) {
			loader.defer(d3.json, els[i].getAttribute('href'));
			var replEl = document.createElement('svg');
			replEl.setAttribute('class', 'graphlet');
			var parentEl = els[i].parentNode;
			d3.select(parentEl)
				.style('width', 'auto')
				.style('text-align', 'center')
				.style('overflow-x', 'auto')
				.style('outline', '1px solid #DDD')
				.append('svg').attr('class', 'graphlet');
			parentEl.removeChild(els[i]);
		}
		loader.awaitAll(onData);
	}

	function onData(err, data) {
		var nodesRaw = data.shift();
		var linksRaw = data.shift();
		var parsed = cywc.parseRawNodesAndLinks(nodesRaw, linksRaw);
		nodeMap = parsed.nodeMap;
		nodes = parsed.nodes;
		links = parsed.links;
		graph = parsed.graph;

		// Render paths
		var aEls = document.querySelectorAll('a');
		for(var i = 0; i < aEls.length; i++) {
			var aEl = aEls[i];
			if(aEl.innerHTML.indexOf('path:') !== 0) continue;
			var names = aEl.innerHTML.substring(5).split(',');
			var path = cywc.shortestPath(graph, nodeMap[names[1]], nodeMap[names[0]]);
			var sentence = document.createElement('span');
			sentence.innerHTML = cywc.composeSentence(path, nodeMap) + '&nbsp;';
			aEl.parentNode.insertBefore(sentence, aEl);
			aEl.innerHTML = '[탐색]';
			aEl.setAttribute('target', '_blank');
			aEl.setAttribute('class', 'explore');
		}

		// Render SVG graphs
		var svgEls = d3.select('body').selectAll('svg.graphlet').data(data);
		svgEls.each(renderGraphlet);
	}

	function renderGraphlet(data) {
		var localNodeMap = {};
		var localNodes = [];
		var localLinks = [];
		var width = d3.max(data.nodes, function(d) {return d.x}) + MARGIN.L + MARGIN.R;
		var height = d3.max(data.nodes, function(d) {return d.y}) + MARGIN.T + MARGIN.B;

		data.nodes.forEach(function(d) {
			var localNode = nodeMap[d.name];
			localNode.x = d.x;
			localNode.y = d.y;
			localNodes.push(localNode);
			localNodeMap[localNode.name] = localNode;
		});
		data.links.forEach(function(d) {
			var localLink = d;
			localLink.source = localNodeMap[localLink.source];
			localLink.target = localNodeMap[localLink.target];
			localLinks.push(localLink);
		});

		var rootEl = d3.select(this)
			.attr('width', width)
			.attr('height', height)
			.append('g')
			.attr('transform', 'translate(' + MARGIN.L + ', ' + MARGIN.T + ')');
		d3.select(this)
			.append('defs')
			.html('<marker id="arrowMarker" viewBox="0 -4 8 8" refX="20" refY="0" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,-4L8,0L0,4" fill="#000" /></marker>');

		var linksEl = rootEl.append('g').attr('class', 'links')
			.selectAll('.link').data(localLinks).enter()
			.append('line')
			.classed('link', true)
			.classed('cur', function(d) {return d.cur;})
			.attr('marker-end', function(d) {
				return d.rel === 'child' ? 'url(#arrowMarker)' : '';
			})
			.attr('stroke', function(d) {return relColorScale(d.rel);})
			.attr('x1', function(d) {return d.source.x;})
			.attr('y1', function(d) {return d.source.y;})
			.attr('x2', function(d) {return d.target.x;})
			.attr('y2', function(d) {return d.target.y;});

		var nodeGroup = rootEl.append('g').attr('class', 'nodes')
			.selectAll('.node').data(localNodes).enter()
			.append('a')
			.attr('xlink:href', function(d) {
				return 'http://cywc.github.io/cards/' + encodeURIComponent(d.name);
			})
			.attr('xlink:show', 'new')
			.append('g')
			.attr('class', 'node fixed')
			.attr('transform', function(d) {return 'translate(' + d.x + ', ' + d.y + ')';});
		nodeGroup.append('circle')
			.attr('fill', function(d) {return genderColorScale(d.gender);})
			.attr('r', 4);
		var mainText = nodeGroup.append('text').attr('class', 'main')
			.attr('dx', 10)
			.attr('dy', '11px');
		mainText.append('tspan').attr('class', 'name')
			.text(function(d) {return d.name;});
		mainText.append('tspan').attr('class', 'birth')
			.attr('font-size', '9px')
			.text(function(d) {return d.birth ? (dateFormat(d.birth) || dateFormatYear(d.birth)).substring(0, 4) : '?';});
		nodeGroup.append('text').attr('class', 'tags')
			.attr('dx', 10)
			.attr('dy', '-2px')
			.attr('font-size', '9px')
			.selectAll('.tag').data(function(n) {return n.tags.split(';');}).enter().append('tspan')
				.attr('dx', function(d, i) {return i === 0 ? 10 : 4;})
				.text(String);
		nodeGroup.append('text').attr('class', 'briefs')
			.attr('dx', 10)
			.attr('dy', '22px')
			.attr('font-size', '9px')
			.text(function(d) {return d.briefs[0] || '';});
	}

	window.addEventListener('load', main);
})();
