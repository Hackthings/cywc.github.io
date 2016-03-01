(function() {
	var cywc = {};

	var dateFormat = d3.time.format('%Y-%m-%d');
	var dateFormatYear = d3.time.format('%Y');

	cywc.findFamily = function(node) {
		// parents
		var father = node.adjs.filter(function(n) {
			return n.out === false && n.link.rel === 'child' && n.node.gender === 'M';
		}).map(function(n) {return n.node;})[0];
		var mother = node.adjs.filter(function(n) {
			return n.out === false && n.link.rel === 'child' && n.node.gender === 'F';
		}).map(function(n) {return n.node;})[0];

		// spouses
		var spouses = node.adjs.filter(function(n) {
			return n.out === true && n.link.rel === 'spouse';
		}).map(function(n) {return n.node;});

		// children
		for(var i = 0; i < spouses.length; i++) {
			var spouse = spouses[i];
			spouse.children = spouse.adjs.filter(function(n) {
				return n.out === true && n.link.rel === 'child' && n.node.adjs.filter(function(n) {
					return n.out === false && n.link.rel === 'child' && n.node === node;
				}).length === 1;
			}).map(function(n) {return n.node;});
			spouse.children.sort(function(a, b) {return d3.ascending(a.birth, b.birth);});
		}

		// children w/o spouses
		var otherChildren = node.adjs.filter(function(n) {
			return n.out === true && n.link.rel === 'child' && n.node.adjs.filter(function(n) {
				return n.out === false && n.link.rel === 'child';
			}).length === 1;
		}).map(function(n) {return n.node;});

		return {
			'parents': [father, mother],
			'spouses': spouses,
			'self': node,
			'otherChildren': otherChildren
		};
	}

	cywc.renderFamily = function(family, el) {
		var rootEl = d3.select(el);

		// parents
		rootEl.append('ul')
			.attr('class', 'parents')
			.selectAll('li.parent')
			.data(family.parents)
			.enter()
				.append('li')
				.attr('class', 'parent')
				.attr('itemprop', 'parent')
				.each(renderFamilyNode);

		// marriages
		if(family.spouses.length) {
			var marriages = rootEl.append('ul')
				.attr('class', 'marriages')
				.selectAll('li.marriage')
				.data(family.spouses)
				.enter()
					.append('li')
					.attr('itemprop', 'spouse')
					.attr('class', 'marriage');

			// self + spouse
			marriages
				.append('div')
				.attr('class', 'self')
				.datum(family.self)
				.each(renderFamilyNode);
			marriages
				.append('div')
				.attr('class', 'spouse')
				.attr('itemprop', 'spouse')
				.each(renderFamilyNode);

			// children
			marriages
				.append('ul')
				.attr('class', 'children')
				.selectAll('li.child')
				.data(function(d) {return d.children;})
				.enter()
					.append('li')
					.attr('class', 'child')
					.attr('itemprop', 'children')
					.each(renderFamilyNode);
		} else {
			var single = rootEl.append('div')
				.attr('class', 'single');
			single
				.append('div')
				.attr('class', 'self')
				.datum(family.self)
				.each(renderFamilyNode);

			// children
			single
				.append('ul')
				.attr('class', 'children')
				.selectAll('li.child')
				.data(family.otherChildren)
				.enter()
					.append('li')
					.attr('class', 'child')
					.attr('itemprop', 'children')
					.each(renderFamilyNode);
		}
	}

	renderFamilyNode = function(node) {
		var nodeEl = d3.select(this)
			.classed('family-node', true)
			.classed('empty', !node)
		if(!node) return;

		nodeEl
			.classed('gender-male', node.gender === 'M')
			.classed('gender-female', node.gender === 'F')

		nodeEl
			.append('a')
			.attr('class', 'name')
			.attr('itemprop', 'name')
			.attr('href', '/cards/' + node.name + '.html')
			.text(node.name);
		nodeEl
			.append('span')
			.attr('class', 'birth')
			.text(node.birth ? (dateFormat(node.birth) || dateFormatYear(node.birth)) : '?');
		nodeEl
			.append('p')
			.attr('class', 'brief')
			.attr('itemprop', 'jobTitle')
			.text(node.briefs[0]);
	}

	cywc.parseRawNodesAndLinks = function(nodesRaw, linksRaw) {
		var graph = new jsnx.Graph();
		var nodeMap = {};

		// Parse nodes
		var nodes = nodesRaw.filter(function(d) {return d.name !== '';});
		nodes.forEach(function(d) {
			if(d.birth === '?') {
				d.birthPrecision = null;
			} else if(d.birth.length === 4) {
				d.birthPrecision = 'year';
			} else {
				d.birthPrecision = 'date';
			}
			d.birth = dateFormat.parse(d.birth) || dateFormatYear.parse(d.birth);
			d.briefs = d.briefs ? d.briefs.split(';') : [];
			d.birthRange = calcDateRange(d.birth, d.birthPrecision);
			d.displayName = d.name.replace(/(.+?)\d+/g, '$1');
			d.adjs = [];
			nodeMap[d.name] = d;
		});

		// Parse links
		var links = linksRaw.filter(function(d) {return d.source !== "";});
		links.forEach(function(d) {
			d.source = nodeMap[d.source];
			d.target = nodeMap[d.target];
			d.source.adjs.push({node: d.target, out: true, link: d})
			d.target.adjs.push({node: d.source, out: false, link: d})
			d.cur = d.cur === '1';
		});

		graph.addNodesFrom(nodes.map(function (d) {
			return d.name;
		}));
		graph.addEdgesFrom(links.map(function (d) {
			return [d.source.name, d.target.name];
		}));

		return {nodeMap: nodeMap, nodes: nodes, links: links, graph: graph};
	}

	cywc.shortestPath = function(graph, source, target) {
		try {
			var result = jsnx.dijkstraPath(graph, {source: source.name, target: target.name});
			return typeof(result) === 'string' ? [result] : result;
		} catch(e) {
			return null;
		}
	}

	cywc.composeSentence = function(path, nodeMap) {
		path = path.map(function (d) { return nodeMap[d]; });
		var rels = ['[' + path[0].name + '] ' + path[0].gender];
		// collect relationships
		for (var i = 1; i < path.length; i++) {
			var prev = path[i - 1];
			var next = path[i];
			var adj = prev.adjs.filter(function (d) {
				return d.node === next;
			})[0];
			var link = adj.link;
			var out = adj.out;
			if (out) {
				rels.push('--' + (link.rel === 'child' ? 'C' : 'S') + '->');
			} else {
				rels.push('<-' + (link.rel === 'child' ? 'C' : 'S') + '--');
			}
			rels.push('[' + next.name + '] ' + next.gender);
		}

		// shorten
		var kinshipStr = kinship(rels.join(' '));

		var tokens = kinshipStr.match(/^(.+)\s(\S+)$/);
		var startNode = convertNameToLink(tokens[2], nodeMap);
		var rest = convertNameToLink(tokens[1], nodeMap);

		return startNode + cywc.josa(path[path.length - 1].displayName, '은는') + ' ' + rest + '이다.';
	}

	function convertNameToLink(s, nodeMap) {
		return s.replace(/\[(.+?)\]/g, function(m0, m1) {
			var brief = nodeMap[m1].briefs[0] || '';
			return (brief ? brief + ' ' : '') + '<a href="/cards/' + encodeURIComponent(m1) + '" class="graphlet name" target="_blank">' + m1 + '</a>';
		});
	}


	// Select appropriate Korean josa
	cywc.josa = function(noun, josa) {
		var candidate = ['을를', '이가', '은는', '와과'].filter(function(d) {return d.indexOf(josa) !== -1;})[0];
		return candidate[(noun.charCodeAt(noun.length - 1) - 44032) % 28 === 0 ? 1 : 0];
	}

	function calcDateRange(d, precision) {
		var dateFrom = null, dateTo = null;

		if (precision === 'year') {
			dateFrom = new Date(d.getTime());
			dateFrom.setMonth(0);
			dateFrom.setDate(1);
			dateTo = new Date(dateFrom.getTime());
			dateTo.setYear(dateTo.getYear() + 1);
			dateTo = new Date(dateTo.getTime() - 1);
		} else if (precision === 'date') {
			dateFrom = new Date(d.getTime());
			dateTo = new Date(dateFrom.getTime());
			dateTo.setDate(dateTo.getDate() + 1);
			dateTo = new Date(dateTo.getTime() - 1);
		} else {
			// Do nothing
		}

		return [dateFrom, dateTo]
	}

	window.cywc = cywc;
})();

